"use client";

import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { MapPin, Clock, Building2, Award, ArrowLeft, Calendar, ShieldCheck, PhoneCall, MessageCircle } from 'lucide-react';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { createPublicContactEnquiry } from '@/lib/enquiries';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';
import { generateMachineSlugPath } from '@/lib/seoUtils';
import { useTranslation } from '@/hooks/useTranslation';

interface DealerDetail {
  id: string;
  userId?: string | null;
  businessName: string | null;
  businessLogoUrl?: string | null;
  district: string | null;
  businessAddress: string | null;
  alternateMobile?: string | null;
  user?: {
    mobile: string | null;
    name: string | null;
  } | null;
  partnerType: string | null;
  workingHours?: string | null;
  businessDescription: string | null;
  contactPreference?: string | null;
  yearsInBusiness: number | null;
  websiteUrl?: string | null;
  createdAt?: string;
  publicContact?: {
    callNumber: string | null;
    whatsappNumber: string | null;
    routingMode?: 'SUPER_ADMIN' | 'SELLER';
    fallbackApplied?: boolean;
  } | null;
}

interface MachineListing {
  id: string;
  title: string;
  price: number;
  isNegotiable: boolean;
  manufacturingYear: number;
  operatingHours: number | null;
  locationCity: string;
  locationState: string;
  condition: string | null;
  status: string;
  brandName: string;
  modelName: string;
  categoryName: string;
  sellerName: string;
  sellerType: string;
  thumbnailUrl: string | null;
}

type DealerDetailPageClientProps = {
  dealerId: string;
  initialDealer: DealerDetail | null;
  initialListings: MachineListing[];
};

export default function DealerDetailPageClient({
  dealerId,
  initialDealer,
  initialListings,
}: DealerDetailPageClientProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const [dealer, setDealer] = useState<DealerDetail | null>(initialDealer);
  const [listings, setListings] = useState<MachineListing[]>(initialListings);
  const [loading, setLoading] = useState(!initialDealer);
  const [loadingListings, setLoadingListings] = useState(initialListings.length === 0);

  const { user, setAuthModalOpen } = useAuthStore();
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    if (!dealerId) return;
    if (initialDealer && initialListings.length > 0) return;

    const fetchDealer = async () => {
      try {
        const response = await api.get(`/master/dealers/` + dealerId);
        if (response.data.success) {
          setDealer(response.data.data);
        }
      } catch (error) {
        console.error('Failed to fetch dealer details:', error);
      } finally {
        setLoading(false);
      }
    };

    const fetchDealerListings = async () => {
      try {
        const response = await api.get(`/master/dealers/` + dealerId + `/listings`);
        if (response.data.success) {
          setListings(response.data.data);
        }
      } catch (error) {
        console.error('Failed to fetch dealer listings:', error);
      } finally {
        setLoadingListings(false);
      }
    };

    if (!initialDealer) {
      fetchDealer();
    }

    if (initialListings.length === 0) {
      fetchDealerListings();
    }
  }, [dealerId, initialDealer, initialListings.length]);

  const normalizeDialNumber = (value?: string | null) => {
    const digits = value?.replace(/\D/g, '') || '';
    if (!digits) {
      return '';
    }

    if (digits.length === 10) {
      return '+91' + digits;
    }

    return digits.startsWith('91') ? '+' + digits : '+' + digits;
  };

  const handleCall = async () => {
    if (!dealer) return;
    const callNumber = normalizeDialNumber(dealer?.publicContact?.callNumber);
    if (!callNumber) return;

    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    try {
      if (user.role === 'CUSTOMER') {
        await createPublicContactEnquiry({
          partnerProfileId: dealer.id,
          enquiryType: 'CALL',
        });
      }
      window.location.href = 'tel:' + callNumber;
    } catch (error) {
      console.error('Failed to register call', error);
      showToast({
        variant: 'error',
        title: t('dealers.enquiryNotCreated'),
        description: t('dealers.enquiryNotCreatedDescription'),
      });
      window.location.href = 'tel:' + callNumber;
    }
  };

  const handleWhatsApp = async () => {
    if (!dealer) return;
    const wpNumber = normalizeDialNumber(dealer?.publicContact?.whatsappNumber);
    if (!wpNumber) return;

    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    try {
      if (user.role === 'CUSTOMER') {
        await createPublicContactEnquiry({
          partnerProfileId: dealer.id,
          enquiryType: 'WHATSAPP',
        });
      }
      const text = encodeURIComponent(t('dealerDetails.whatsappIntro'));
      window.open('https://wa.me/' + wpNumber.replace('+', '') + '?text=' + text, '_blank');
    } catch (error) {
      console.error('Failed to register whatsapp', error);
      showToast({
        variant: 'error',
        title: t('dealers.enquiryNotCreated'),
        description: t('dealers.enquiryNotCreatedDescription'),
      });
      const text = encodeURIComponent(t('dealerDetails.whatsappIntro'));
      window.open('https://wa.me/' + wpNumber.replace('+', '') + '?text=' + text, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-jcb-yellow"></div>
      </div>
    );
  }

  if (!dealer) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <Building2 className="mb-4 h-16 w-16 text-gray-400" />
        <h2 className="mb-2 text-2xl font-bold text-gray-900">{t('dealerDetails.notFound')}</h2>
        <p className="mb-6 text-gray-500">{t('dealerDetails.notFoundDescription')}</p>
        <button onClick={() => router.back()} className="rounded-md bg-jcb-yellow px-6 py-2 font-bold text-gray-900 hover:bg-yellow-400">
          {t('dealerDetails.goBack')}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 pt-8 pb-32 lg:pb-40 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}></div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Link href="/dealers" className="inline-flex items-center text-sm font-medium text-gray-300 hover:text-white transition-colors mb-8">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('dealerDetails.backToDealers')}
          </Link>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-gray-800 bg-white shadow-xl">
                {dealer.businessLogoUrl ? (
                  <Image
                    src={getAbsoluteFileUrl(dealer.businessLogoUrl)}
                    alt={dealer.businessName ? `${dealer.businessName} dealer logo` : 'Dealer logo'}
                    fill
                    sizes="112px"
                    className="object-contain p-2"
                  />
                ) : (
                  <Building2 className="h-12 w-12 text-gray-300" />
                )}
              </div>

              <div className="text-white">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                    {dealer.businessName || t('dealerDetails.notFound')}
                  </h1>
                  {dealer.partnerType && (
                    <span className="inline-flex items-center rounded-full bg-jcb-yellow px-3 py-1 text-xs font-bold uppercase tracking-wider text-gray-900 shadow-sm">
                      <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                      {formatPartnerTypeLabel(dealer.partnerType)}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-medium text-gray-300">
                  {(dealer.businessAddress || dealer.district) && (
                    <div className="flex items-center">
                      <MapPin className="mr-2 h-4 w-4 text-jcb-yellow" />
                      {[dealer.businessAddress, dealer.district].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {dealer.yearsInBusiness && (
                    <div className="flex items-center">
                      <Award className="mr-2 h-4 w-4 text-jcb-yellow" />
                      {t('dealerDetails.yearsExperience', { count: dealer.yearsInBusiness })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden lg:flex flex-row items-center gap-3 pb-1">
              <button
                onClick={handleCall}
                className="flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-gray-900 shadow-lg transition-all hover:bg-gray-50 hover:scale-105"
              >
                <PhoneCall className="h-5 w-5" />
                {t('dealers.call')}
              </button>

              {dealer.publicContact?.whatsappNumber && (
                <button
                  onClick={handleWhatsApp}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 font-bold text-white shadow-lg transition-all hover:bg-[#20bd5a] hover:scale-105"
                >
                  <MessageCircle className="h-5 w-5" />
                  {t('dealerDetails.whatsapp')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 -mt-16 lg:-mt-24 relative z-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-8">
            <div className="lg:hidden flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
              <button
                onClick={handleCall}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 font-bold text-gray-900 shadow-sm transition-all hover:bg-gray-50 active:bg-gray-100"
              >
                <PhoneCall className="h-5 w-5" />
                {t('dealers.call')}
              </button>

              {dealer.publicContact?.whatsappNumber && (
                <button
                  onClick={handleWhatsApp}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 font-bold text-white shadow-sm transition-all hover:bg-[#20bd5a] active:bg-[#1da851]"
                >
                  <MessageCircle className="h-5 w-5" />
                  {t('dealerDetails.whatsapp')}
                </button>
              )}
            </div>

            {dealer.businessDescription && (
              <div className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-8 shadow-sm">
                <h3 className="mb-4 text-xl font-bold text-gray-900 flex items-center">
                  <Building2 className="mr-2 h-5 w-5 text-jcb-yellow" />
                  {t('dealerDetails.aboutDealer')}
                </h3>
                <div className="prose max-w-none text-gray-600">
                  <p className="whitespace-pre-wrap leading-relaxed">{dealer.businessDescription}</p>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-8 shadow-sm">
              <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
                <h3 className="text-xl font-bold text-gray-900 flex items-center">
                  {t('dealerDetails.availableMachines')}
                  <span className="ml-3 rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600">
                    {listings.length}
                  </span>
                </h3>
              </div>

              {loadingListings ? (
                <div className="flex h-40 items-center justify-center rounded-xl bg-gray-50 border border-gray-100">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-jcb-yellow"></div>
                </div>
              ) : listings.length === 0 ? (
                <div className="rounded-xl border border-gray-100 bg-gray-50 py-16 text-center text-gray-500">
                  <Building2 className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                  <p className="text-lg font-medium text-gray-900">{t('dealerDetails.noActiveListings')}</p>
                  <p className="mt-1">{t('dealerDetails.noActiveListingsDescription')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {listings.map((listing) => (
                    <Link
                      href={generateMachineSlugPath(listing)}
                      key={listing.id}
                      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:border-jcb-yellow hover:shadow-md"
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                        {listing.thumbnailUrl ? (
                          <Image
                            src={getAbsoluteFileUrl(listing.thumbnailUrl)}
                            alt={`${listing.title}${listing.locationCity ? ` in ${listing.locationCity}` : ''}`}
                            fill
                            sizes="(max-width: 640px) 100vw, 50vw"
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <span className="text-gray-400">{t('dealerDetails.noImage')}</span>
                          </div>
                        )}
                        <div className="absolute left-3 top-3 rounded bg-black/70 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                          {listing.categoryName}
                        </div>
                      </div>
                      <div className="flex flex-grow flex-col p-4">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{listing.brandName}</span>
                          <span className="text-xs font-semibold text-jcb-yellow">{listing.manufacturingYear}</span>
                        </div>
                        <h4 className="mb-2 line-clamp-1 font-bold text-gray-900">{listing.title}</h4>
                        <div className="mb-4 text-xl font-bold text-gray-900">
                          Rs {listing.price.toLocaleString('en-IN')}
                        </div>
                        <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
                          <div className="flex items-center">
                            <MapPin className="mr-1 h-3 w-3" />
                            {listing.locationCity}
                          </div>
                          {listing.operatingHours && (
                            <div className="flex items-center">
                              <Clock className="mr-1 h-3 w-3" />
                              {t('dealerDetails.hoursValue', { count: listing.operatingHours })}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1 hidden lg:block">
            <div className="sticky top-24 space-y-6">
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-bold text-gray-900">{t('dealerDetails.information')}</h3>

                {dealer.createdAt && (
                  <div className="mb-4">
                    <h4 className="mb-2 flex items-center text-sm font-semibold text-gray-900">
                      <Calendar className="mr-2 h-4 w-4 text-jcb-yellow" />
                      {t('dealerDetails.memberSince')}
                    </h4>
                    <p className="text-sm text-gray-600 pl-6">
                      {new Date(dealer.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                )}

                {dealer.workingHours && (
                  <div className="mb-4 pt-4 border-t border-gray-100">
                    <h4 className="mb-2 flex items-center text-sm font-semibold text-gray-900">
                      <Clock className="mr-2 h-4 w-4 text-jcb-yellow" />
                      {t('dealerDetails.businessHours')}
                    </h4>
                    <p className="text-sm text-gray-600 pl-6">{dealer.workingHours}</p>
                  </div>
                )}

                {dealer.contactPreference && (
                  <div className="mb-4 pt-4 border-t border-gray-100">
                    <h4 className="mb-2 flex items-center text-sm font-semibold text-gray-900">
                      <MessageCircle className="mr-2 h-4 w-4 text-jcb-yellow" />
                      {t('dealerDetails.contactPreference')}
                    </h4>
                    <p className="text-sm text-gray-600 pl-6 capitalize">{dealer.contactPreference.replace(/_/g, ' ').toLowerCase()}</p>
                  </div>
                )}

                {dealer.websiteUrl && (
                  <div className="pt-4 border-t border-gray-100">
                    <h4 className="mb-2 flex items-center text-sm font-semibold text-gray-900">
                      <Building2 className="mr-2 h-4 w-4 text-jcb-yellow" />
                      {t('dealerDetails.website')}
                    </h4>
                    <a href={dealer.websiteUrl.startsWith('http') ? dealer.websiteUrl : 'https://' + dealer.websiteUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline pl-6 break-all">
                      {dealer.websiteUrl}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
