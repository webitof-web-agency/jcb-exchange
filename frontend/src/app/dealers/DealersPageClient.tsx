"use client";

import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { MapPin, Clock, Building2, Phone, Award, Truck, Layers } from 'lucide-react';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { createPublicContactEnquiry } from '@/lib/enquiries';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import CustomerPrimePaymentModal from '@/components/payments/CustomerPrimePaymentModal';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';
import { useTranslation } from '@/hooks/useTranslation';
import { generateDealerSlugPath } from '@/lib/seoUtils';

interface Dealer {
  id: string;
  userId?: string | null;
  businessName: string | null;
  businessLogoUrl: string | null;
  district: string | null;
  businessAddress: string | null;
  alternateMobile: string | null;
  user: {
    mobile: string | null;
    name: string | null;
  } | null;
  partnerType: string | null;
  workingHours: string | null;
  businessDescription: string | null;
  contactPreference: string | null;
  yearsInBusiness: number | null;
  publicContact: {
    callNumber: string | null;
    whatsappNumber: string | null;
    routingMode: 'SUPER_ADMIN' | 'SELLER';
    fallbackApplied: boolean;
  };
}

export default function DealersPageClient() {
  const { t } = useTranslation();
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDealerContact, setSelectedDealerContact] = useState<{
    callNumber: string;
    partnerProfileId: string;
  } | null>(null);
  const { user, setAuthModalOpen } = useAuthStore();
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    const fetchDealers = async () => {
      try {
        const response = await api.get('/master/dealers');
        if (response.data.success) {
          setDealers(response.data.data);
        }
      } catch (error) {
        console.error('Failed to fetch dealers:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDealers();
  }, []);

  const normalizeDialNumber = (value?: string | null) => {
    const digits = value?.replace(/\D/g, '') || '';
    if (!digits) {
      return '';
    }

    if (digits.length === 10) {
      return `+91${digits}`;
    }

    return digits.startsWith('91') ? `+${digits}` : `+${digits}`;
  };

  const handleDealerCall = async (callNumber: string, partnerProfileId: string) => {
    try {
      await createPublicContactEnquiry({
        partnerProfileId,
        enquiryType: 'CALL',
      });

      window.location.href = `tel:${callNumber}`;
    } catch (error) {
      console.error('Failed to create dealer enquiry:', error);
      showToast({
        title: t('dealers.enquiryNotCreated'),
        description: t('dealers.enquiryNotCreatedDescription'),
        variant: 'error',
      });
    } finally {
      setSelectedDealerContact(null);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 py-12 px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
        <div className="mb-8 sm:mb-16 text-center">
          <h1 className="mb-4 text-3xl font-bold text-gray-900 sm:text-4xl md:text-5xl">
            {t('dealers.trustedPartners')}
          </h1>
          <p className="hidden sm:block mx-auto max-w-2xl text-sm text-gray-500 sm:text-base">
            Compare dealer profiles, then continue browsing live listings and equipment categories across the marketplace.
          </p>
          <div className="mt-6 flex flex-row items-center justify-center gap-2 sm:gap-3.5 w-full max-w-md mx-auto">
            <Link
              href="/machines"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-[#FFC107] px-3 sm:px-5 py-2.5 text-[11px] sm:text-sm font-bold text-black shadow-xs transition-all hover:bg-[#FFB300] hover:shadow-md active:scale-95 text-center whitespace-nowrap"
            >
              <Truck className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              Browse machines
            </Link>
            <Link
              href="/categories"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-gray-300 bg-white px-3 sm:px-5 py-2.5 text-[11px] sm:text-sm font-semibold text-gray-800 shadow-2xs transition-all hover:bg-gray-50 hover:border-gray-400 active:scale-95 text-center whitespace-nowrap"
            >
              <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-600 shrink-0" />
              Browse categories
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-jcb-yellow"></div>
          </div>
        ) : dealers.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-20 text-center text-gray-500 shadow-sm">
            <Building2 className="mx-auto mb-4 h-16 w-16 text-gray-400" />
            <h3 className="text-xl font-semibold text-gray-900">{t('dealers.noDealersFound')}</h3>
            <p className="mt-2">{t('dealers.dealerEmptyDescription')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {dealers.map((dealer) => {
              const visibleCallNumber = normalizeDialNumber(dealer.publicContact?.callNumber);

              return (
                <div
                  key={dealer.id}
                  className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:border-jcb-yellow hover:shadow-md"
                >
                  <Link href={generateDealerSlugPath(dealer)} className="flex-grow p-6 transition-colors hover:bg-gray-50">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                        {dealer.businessLogoUrl ? (
                          <Image
                            src={getAbsoluteFileUrl(dealer.businessLogoUrl)}
                            alt={dealer.businessName ? `${dealer.businessName} dealer logo` : 'Dealer logo'}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        ) : (
                          <Building2 className="h-8 w-8 text-gray-400" />
                        )}
                      </div>
                      {dealer.partnerType && (
                        <span className="rounded-full bg-jcb-yellow/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-jcb-yellow">
                          {formatPartnerTypeLabel(dealer.partnerType)}
                        </span>
                      )}
                    </div>

                    <h3 className="mb-2 text-xl font-bold text-gray-900 transition-colors group-hover:text-jcb-yellow">
                      {dealer.businessName || 'Unnamed Dealer'}
                    </h3>

                    {dealer.businessDescription && (
                      <p className="mb-6 line-clamp-3 text-sm text-gray-600">
                        {dealer.businessDescription}
                      </p>
                    )}

                    <div className="mt-auto space-y-3 border-t border-gray-100 pt-4">
                      {(dealer.businessAddress || dealer.district) && (
                        <div className="flex items-start text-sm text-gray-600">
                          <MapPin className="mr-3 mt-0.5 h-4 w-4 shrink-0 text-jcb-yellow" />
                          <span>{[dealer.businessAddress, dealer.district].filter(Boolean).join(', ')}</span>
                        </div>
                      )}

                      {dealer.yearsInBusiness && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Award className="mr-3 h-4 w-4 shrink-0 text-jcb-yellow" />
                          <span>{t('dealers.yearsInBusiness', { count: dealer.yearsInBusiness })}</span>
                        </div>
                      )}

                      {dealer.workingHours && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Clock className="mr-3 h-4 w-4 shrink-0 text-jcb-yellow" />
                          <span>{dealer.workingHours}</span>
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="mt-auto flex gap-3 p-6 pt-0">
                    {visibleCallNumber ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!user) {
                            setAuthModalOpen(true);
                            return;
                          }

                          if (user.role === 'CUSTOMER') {
                            setSelectedDealerContact({
                              callNumber: visibleCallNumber,
                              partnerProfileId: dealer.id,
                            });
                            return;
                          }

                          window.location.href = `tel:${visibleCallNumber}`;
                        }}
                        className="flex flex-1 items-center justify-center gap-2 rounded-md border-2 border-jcb-yellow bg-white py-3 font-bold text-gray-900 transition-all duration-300 hover:bg-yellow-50"
                      >
                        <Phone className="h-4 w-4" />
                        {t('dealers.call')}
                      </button>
                    ) : (
                      <div className="flex flex-1 items-center justify-center gap-2 rounded-md border-2 border-gray-200 bg-gray-100 py-3 font-bold text-gray-400">
                        <Phone className="h-4 w-4" />
                        {t('dealers.contactUnavailable')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {selectedDealerContact ? (
        <CustomerPrimePaymentModal
          isOpen={!!selectedDealerContact}
          feature="CALL"
          onClose={() => setSelectedDealerContact(null)}
          onAccessGranted={() => {
            if (selectedDealerContact) {
              void handleDealerCall(
                selectedDealerContact.callNumber,
                selectedDealerContact.partnerProfileId,
              );
            }
          }}
        />
      ) : null}
    </>
  );
}
