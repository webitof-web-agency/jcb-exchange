"use client";

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { Clock3, ShieldCheck, Sparkles, User, List, CreditCard, Briefcase } from 'lucide-react';
import { useLanguageStore } from '@/store/languageStore';
import { useTranslation } from '@/hooks/useTranslation';
import BrandLoader from '@/components/ui/BrandLoader';

type ProfileTab = 'personal' | 'listings' | 'payments' | 'applications';

const ProfileTabLoading = () => (
  <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-gray-100 bg-white shadow-sm">
    <BrandLoader size="md" variant="section" bg="light" />
  </div>
);

const PersonalInfoTab = dynamic(() => import('@/components/profile/PersonalInfoTab'), { loading: ProfileTabLoading });
const MyListingsTab = dynamic(() => import('@/components/profile/MyListingsTab'), { loading: ProfileTabLoading });
const PaymentHistoryTab = dynamic(() => import('@/components/profile/PaymentHistoryTab'), { loading: ProfileTabLoading });
const MyApplicationsTab = dynamic(() => import('@/components/profile/MyApplicationsTab'), { loading: ProfileTabLoading });

const getTabFromQuery = (value: string | null, canViewPaymentHistory: boolean): ProfileTab => {
  if (value === 'listings' || value === 'applications') {
    return value;
  }

  if (value === 'payments' && canViewPaymentHistory) {
    return value;
  }

  return 'personal';
};

const getDaysRemaining = (expiry?: string | null) => {
  if (!expiry) {
    return null;
  }

  const expiryDate = new Date(expiry);
  const today = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfExpiry = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate());
  const diffDays = Math.ceil((startOfExpiry.getTime() - startOfToday.getTime()) / msPerDay);

  return diffDays;
};

export default function ProfilePageClient() {
  const { t } = useTranslation();
  const locale = useLanguageStore((state) => state.locale);
  const router = useRouter();
  const { isAuthenticated, hasHydrated, user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ProfileTab>('personal');
  const daysRemaining = useMemo(() => getDaysRemaining(user?.primeSubscriptionExpiresAt), [user?.primeSubscriptionExpiresAt]);
  const isPrimeActive = Boolean(user?.isPrimeCustomer && daysRemaining !== null && daysRemaining >= 0);
  const canViewPaymentHistory = user?.role === 'CUSTOMER';

  const selectTab = (tab: ProfileTab) => {
    setActiveTab(tab);
    router.replace(`/profile?tab=${tab}`, { scroll: false });
  };

  useEffect(() => {
    if (!hasHydrated) return;

    if (!isAuthenticated) {
      router.push('/');
    }
  }, [hasHydrated, isAuthenticated, router]);

  useEffect(() => {
    if (!hasHydrated) return;

    const syncTabFromUrl = () => {
      const queryTab = new URLSearchParams(window.location.search).get('tab');
      setActiveTab(getTabFromQuery(queryTab, canViewPaymentHistory));
    };

    syncTabFromUrl();
    window.addEventListener('popstate', syncTabFromUrl);

    return () => window.removeEventListener('popstate', syncTabFromUrl);
  }, [canViewPaymentHistory, hasHydrated]);

  if (!hasHydrated || !isAuthenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-gray-50">
        <BrandLoader size="md" variant="section" bg="light" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-0 sm:py-10 px-0 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 sm:mb-8 overflow-hidden sm:rounded-2xl bg-[linear-gradient(135deg,#111111_0%,#1b1b1b_52%,#2a2207_100%)] text-white sm:shadow-lg">
          <div className="flex flex-col gap-5 p-5 sm:gap-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className={`inline-flex items-center gap-2 ${user?.isPrimeCustomer ? 'text-[#FFD54A]' : 'text-white'}`}>
                {user?.isPrimeCustomer ? (
                  <Sparkles className="h-6 w-6" />
                ) : (
                  <ShieldCheck className="h-6 w-6 text-[#FFD54A]" />
                )}
                <h2 className="text-xl font-black tracking-tight sm:text-2xl">
                  {user?.isPrimeCustomer
                    ? t('profile.primeMembership', 'Prime Membership')
                    : t('profile.membershipDetails', 'Membership Details')}
                </h2>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 lg:gap-6">
              <div className="flex-1 min-w-[140px] rounded-xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('profile.status', 'STATUS')}</div>
                <div className="mt-1.5 flex items-center gap-2 text-base font-bold">
                  <ShieldCheck className={`h-4 w-4 ${user?.isPrimeCustomer ? 'text-[#FFD54A]' : 'text-gray-400'}`} />
                  {user?.isPrimeCustomer
                    ? (isPrimeActive ? t('profile.primeActive', 'Prime Active') : t('profile.standard', 'Standard'))
                    : t('profile.standard', 'Standard')}
                </div>
              </div>
              <div className="flex-1 min-w-[140px] rounded-xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('profile.expiresOn', 'EXPIRES ON')}</div>
                <div className="mt-1.5 text-base font-bold">
                  {user?.isPrimeCustomer && user?.primeSubscriptionExpiresAt
                    ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(user.primeSubscriptionExpiresAt))
                    : t('profile.notAvailable', 'N/A')}
                </div>
              </div>
              <div className="flex-1 min-w-[140px] rounded-xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('profile.daysLeft', 'DAYS LEFT')}</div>
                <div className="mt-1.5 flex items-center gap-2 text-base font-bold">
                  <Clock3 className={`h-4 w-4 ${user?.isPrimeCustomer ? 'text-[#FFD54A]' : 'text-gray-400'}`} />
                  {!user?.isPrimeCustomer || daysRemaining === null
                    ? t('profile.notAvailable', 'N/A')
                    : daysRemaining < 0
                      ? t('profile.expired', 'Expired')
                      : daysRemaining === 1
                        ? t('profile.dayCount', '1 day', { count: daysRemaining })
                        : t('profile.dayCountPlural', `${daysRemaining} days`, { count: daysRemaining })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col md:flex-row gap-4 sm:gap-8">
            <div className="w-full md:w-64 flex-shrink-0 px-4 sm:px-0">
              <div className="rounded-xl sm:rounded-2xl bg-white shadow-sm sm:shadow-xl sm:shadow-gray-200/50 overflow-hidden border border-gray-100 sm:border-0">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                  <h3 className="font-bold text-gray-900">{t('profile.accountMenu', 'Account Menu')}</h3>
                </div>
                <nav className="p-2 space-y-1">
                  <button
                    onClick={() => selectTab('personal')}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                      activeTab === 'personal'
                        ? 'bg-yellow-50 text-yellow-800'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <User className={`h-5 w-5 ${activeTab === 'personal' ? 'text-yellow-600' : 'text-gray-400'}`} />
                    {t('profile.personalInfo', 'Personal Info')}
                  </button>

                  <button
                    onClick={() => selectTab('listings')}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                      activeTab === 'listings'
                        ? 'bg-yellow-50 text-yellow-800'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <List className={`h-5 w-5 ${activeTab === 'listings' ? 'text-yellow-600' : 'text-gray-400'}`} />
                    {t('profile.myListings', 'My Listings')}
                  </button>

                  {canViewPaymentHistory && (
                    <button
                      onClick={() => selectTab('payments')}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                        activeTab === 'payments'
                          ? 'bg-yellow-50 text-yellow-800'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <CreditCard className={`h-5 w-5 ${activeTab === 'payments' ? 'text-yellow-600' : 'text-gray-400'}`} />
                      {t('profile.paymentHistory', 'Payment History')}
                    </button>
                  )}

                  <button
                    onClick={() => selectTab('applications')}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                      activeTab === 'applications'
                        ? 'bg-yellow-50 text-yellow-800'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Briefcase className={`h-5 w-5 ${activeTab === 'applications' ? 'text-yellow-600' : 'text-gray-400'}`} />
                    {t('profile.myApplications', 'My Applications')}
                  </button>
                </nav>
              </div>
            </div>

            <div className="flex-1 min-w-0 px-4 sm:px-0 mb-8 sm:mb-0">
              {activeTab === 'personal' && <PersonalInfoTab />}
              {activeTab === 'listings' && <MyListingsTab />}
              {activeTab === 'payments' && <PaymentHistoryTab />}
              {activeTab === 'applications' && <MyApplicationsTab />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
