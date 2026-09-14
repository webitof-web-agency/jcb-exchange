"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clock3, ShieldCheck, Sparkles, User, List, ChevronRight, Crown, CalendarDays } from 'lucide-react';
import PersonalInfoTab from '@/components/profile/PersonalInfoTab';
import MyListingsTab from '@/components/profile/MyListingsTab';
import { useLanguageStore } from '@/store/languageStore';
import { useTranslation } from '@/hooks/useTranslation';

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
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'listings' ? 'listings' : 'personal';
  const { isAuthenticated, hasHydrated, user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'personal' | 'listings'>(initialTab);
  const daysRemaining = useMemo(() => getDaysRemaining(user?.primeSubscriptionExpiresAt), [user?.primeSubscriptionExpiresAt]);
  const isPrimeActive = Boolean(user?.isPrimeCustomer && daysRemaining !== null && daysRemaining >= 0);

  useEffect(() => {
    if (!hasHydrated) return;

    if (!isAuthenticated) {
      router.push('/');
    }
  }, [hasHydrated, isAuthenticated, router]);

  if (!hasHydrated || !isAuthenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FFC107] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-0 sm:py-10 px-0 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* DESKTOP VIEW (Original Design) */}
        <div className="hidden sm:block mb-8 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#111111_0%,#1b1b1b_52%,#2a2207_100%)] text-white shadow-lg">
          <div className="flex flex-col gap-5 p-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-[#FFD54A]">
                <Sparkles className="h-6 w-6" />
                <h2 className="text-xl font-black tracking-tight sm:text-2xl">{t('profile.primeMembership')}</h2>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 lg:gap-6">
              <div className="flex-1 min-w-[140px] rounded-xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('profile.status')}</div>
                <div className="mt-1.5 flex items-center gap-2 text-base font-bold">
                  <ShieldCheck className="h-4 w-4 text-[#FFD54A]" />
                  {isPrimeActive ? t('profile.primeActive') : t('profile.standard')}
                </div>
              </div>
              <div className="flex-1 min-w-[140px] rounded-xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('profile.expiresOn')}</div>
                <div className="mt-1.5 text-base font-bold">
                  {user?.primeSubscriptionExpiresAt
                    ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(user.primeSubscriptionExpiresAt))
                    : t('profile.notAvailable')}
                </div>
              </div>
              <div className="flex-1 min-w-[140px] rounded-xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('profile.daysLeft')}</div>
                <div className="mt-1.5 flex items-center gap-2 text-base font-bold">
                  <Clock3 className="h-4 w-4 text-[#FFD54A]" />
                  {daysRemaining === null
                    ? t('profile.notAvailable')
                    : daysRemaining < 0
                      ? t('profile.expired')
                      : daysRemaining === 1
                        ? t('profile.dayCount', { count: daysRemaining })
                        : t('profile.dayCountPlural', { count: daysRemaining })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MOBILE VIEW (New Design) */}
        <div className="sm:hidden mb-4 overflow-hidden rounded-2xl bg-[#0a0a0a] relative text-white border border-[#FFD54A]/20 shadow-[0_0_20px_rgba(255,213,74,0.15)] mx-4 mt-6">
          {/* Background Glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#FFD54A]/15 via-[#111] to-[#111]"></div>
          
          <div className="relative p-5 flex flex-col gap-4">
            {/* Header */}
            <div>
              <div className="inline-flex items-center gap-3 text-[#FFD54A]">
                <Crown className="h-7 w-7" />
                <h2 className="text-[20px] font-black tracking-tight">{t('profile.primeMembership')}</h2>
              </div>
              <p className="mt-1 text-[12px] text-gray-400">Get more from JCB Exchange. Exclusive access.</p>
            </div>

            {/* Horizontal Scrollable Cards */}
            <div className="flex gap-2 sm:gap-3 pb-1">
              {/* Card 1: Status */}
              <div className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-2 backdrop-blur-sm text-center">
                <ShieldCheck className="h-5 w-5 text-[#FFD54A]" />
                <div>
                  <div className="text-[8px] font-semibold uppercase tracking-wider text-gray-400">{t('profile.status')}</div>
                  <div className="text-[11px] font-bold leading-tight mt-0.5 whitespace-nowrap">
                    {isPrimeActive ? "Prime Active" : t('profile.standard')}
                  </div>
                </div>
              </div>
              
              {/* Card 2: Expires On */}
              <div className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-2 backdrop-blur-sm text-center">
                <CalendarDays className="h-5 w-5 text-[#FFD54A]" />
                <div>
                  <div className="text-[8px] font-semibold uppercase tracking-wider text-gray-400">{t('profile.expiresOn')}</div>
                  <div className="text-[11px] font-bold leading-tight mt-0.5 whitespace-nowrap">
                    {user?.primeSubscriptionExpiresAt
                      ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(user.primeSubscriptionExpiresAt))
                      : t('profile.notAvailable')}
                  </div>
                </div>
              </div>
              
              {/* Card 3: Days Left */}
              <div className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-2 backdrop-blur-sm text-center">
                <Clock3 className="h-5 w-5 text-[#FFD54A]" />
                <div>
                  <div className="text-[8px] font-semibold uppercase tracking-wider text-gray-400">{t('profile.daysLeft')}</div>
                  <div className="text-[11px] font-bold leading-tight mt-0.5 whitespace-nowrap">
                    {daysRemaining === null
                      ? t('profile.notAvailable')
                      : daysRemaining < 0
                        ? t('profile.expired')
                        : daysRemaining === 1
                          ? t('profile.dayCount', { count: daysRemaining })
                          : t('profile.dayCountPlural', { count: daysRemaining })}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col md:flex-row gap-4 sm:gap-8">
            <div className="w-full md:w-64 flex-shrink-0 px-4 sm:px-0">
              <div className="rounded-xl sm:rounded-2xl bg-white shadow-sm sm:shadow-xl sm:shadow-gray-200/50 overflow-hidden border border-gray-100 sm:border-0 p-4 sm:p-5">
                <h3 className="text-[17px] font-bold text-gray-900 mb-3 sm:mb-4">{t('profile.accountMenu')}</h3>
                <nav className="space-y-2">
                  <button
                    onClick={() => {
                      setActiveTab('personal');
                      router.replace('/profile');
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
                      activeTab === 'personal'
                        ? 'bg-[#FFF9E6] text-[#854d0e]'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <User className={`h-[18px] w-[18px] ${activeTab === 'personal' ? 'text-[#d97706]' : 'text-gray-400'}`} />
                      {t('profile.personalInfo')}
                    </div>
                    <ChevronRight className={`h-4 w-4 ${activeTab === 'personal' ? 'text-[#d97706]' : 'text-gray-400 opacity-50'}`} />
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab('listings');
                      router.replace('/profile?tab=listings');
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
                      activeTab === 'listings'
                        ? 'bg-[#FFF9E6] text-[#854d0e]'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <List className={`h-[18px] w-[18px] ${activeTab === 'listings' ? 'text-[#d97706]' : 'text-gray-400'}`} />
                      {t('profile.myListings')}
                    </div>
                    <ChevronRight className={`h-4 w-4 ${activeTab === 'listings' ? 'text-[#d97706]' : 'text-gray-400 opacity-50'}`} />
                  </button>
                </nav>
              </div>
            </div>

            <div className="flex-1 min-w-0 px-4 sm:px-0 mb-8 sm:mb-0">
              {activeTab === 'personal' && <PersonalInfoTab />}
              {activeTab === 'listings' && <MyListingsTab />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
