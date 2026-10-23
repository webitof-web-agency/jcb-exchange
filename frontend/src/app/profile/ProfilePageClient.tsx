"use client";

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { 
  Clock3, 
  User, 
  List, 
  CreditCard, 
  Briefcase, 
  Check, 
  Phone, 
  MessageCircle, 
  HelpCircle, 
  Calendar, 
  Mail, 
  Crown, 
  ChevronRight 
} from 'lucide-react';
import { useLanguageStore } from '@/store/languageStore';
import { useTranslation } from '@/hooks/useTranslation';
import BrandLoader from '@/components/ui/BrandLoader';
import api from '@/lib/api';
import { getDialHref, getWhatsAppHref } from '@/lib/supportContact';

type ProfileTab = 'personal' | 'listings' | 'payments' | 'applications';

type SupportContactResponse = {
  data?: {
    contact?: {
      phoneNumber?: string | null;
      supportWhatsappNumber?: string | null;
    };
  };
};

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
  const [supportContact, setSupportContact] = useState({
    phoneNumber: '',
    supportWhatsappNumber: '',
  });
  const daysRemaining = useMemo(() => getDaysRemaining(user?.primeSubscriptionExpiresAt), [user?.primeSubscriptionExpiresAt]);
  const isPrimeActive = Boolean(user?.isPrimeCustomer && daysRemaining !== null && daysRemaining >= 0);
  const canViewPaymentHistory = user?.role === 'CUSTOMER';
  const supportCallHref = getDialHref(supportContact.phoneNumber);
  const supportWhatsappHref = getWhatsAppHref(supportContact.supportWhatsappNumber);

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
    let cancelled = false;

    const loadSupportContact = async () => {
      try {
        const response = await api.get<SupportContactResponse>('/master/footer');
        if (cancelled) {
          return;
        }

        setSupportContact({
          phoneNumber: String(response.data.data?.contact?.phoneNumber || '').trim(),
          supportWhatsappNumber: String(response.data.data?.contact?.supportWhatsappNumber || '').trim(),
        });
      } catch {
        if (!cancelled) {
          setSupportContact({ phoneNumber: '', supportWhatsappNumber: '' });
        }
      }
    };

    void loadSupportContact();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const userDisplayName = user?.name?.trim() || user?.email?.split('@')[0] || 'Member';
  const userInitial = userDisplayName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8 lg:py-10 px-3 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* ── Top Membership & User Identity Hero Banner ── */}
        <div className="mb-6 sm:mb-8 overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-gray-950 via-slate-900 to-[#1F1905] border border-amber-500/20 text-white shadow-xl">
          <div className="flex flex-col gap-6 p-5 sm:p-7 lg:p-8 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: User Identity + Avatar + Greeting + Tier Badge */}
            <div className="flex items-center gap-4 sm:gap-5 min-w-0">
              <div className="relative shrink-0">
                <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-400 via-yellow-400 to-amber-200 text-2xl sm:text-3xl font-black text-gray-950 shadow-lg shadow-amber-500/20 ring-4 ring-white/10">
                  {userInitial}
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-gray-950 shadow-xs" title="Account Active">
                  <Check size={12} strokeWidth={3} />
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white truncate max-w-[280px] sm:max-w-md">
                    {userDisplayName}
                  </h1>
                  {user?.isPrimeCustomer ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase bg-gradient-to-r from-amber-400 to-yellow-300 text-gray-950 shadow-sm shadow-amber-400/20">
                      <Crown className="h-3.5 w-3.5 fill-current" />
                      Prime Member
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/10 text-gray-300 border border-white/10">
                      Standard Member
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                  {user?.email && (
                    <span className="flex items-center gap-1 truncate">
                      <Mail className="h-3.5 w-3.5 text-gray-500" />
                      {user.email}
                    </span>
                  )}
                  {user?.mobile && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-gray-500" />
                      {user.mobile}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Glassmorphic Membership Metric Cards */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5 lg:gap-4 shrink-0">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:px-4 sm:py-3.5 backdrop-blur-md hover:bg-white/10 transition-colors">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {t('profile.status', 'STATUS')}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="truncate">
                    {user?.isPrimeCustomer
                      ? (isPrimeActive ? t('profile.primeActive', 'Prime Active') : t('profile.standard', 'Standard'))
                      : t('profile.standard', 'Standard')}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:px-4 sm:py-3.5 backdrop-blur-md hover:bg-white/10 transition-colors">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {t('profile.expiresOn', 'EXPIRES ON')}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white">
                  <Calendar className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">
                    {user?.isPrimeCustomer && user?.primeSubscriptionExpiresAt
                      ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(user.primeSubscriptionExpiresAt))
                      : t('profile.notAvailable', 'N/A')}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:px-4 sm:py-3.5 backdrop-blur-md hover:bg-white/10 transition-colors">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {t('profile.daysLeft', 'DAYS LEFT')}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white">
                  <Clock3 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="truncate text-amber-300 font-extrabold">
                    {!user?.isPrimeCustomer || daysRemaining === null
                      ? t('profile.notAvailable', 'N/A')
                      : daysRemaining < 0
                        ? t('profile.expired', 'Expired')
                        : daysRemaining === 1
                          ? t('profile.dayCount', '1 day', { count: daysRemaining })
                          : t('profile.dayCountPlural', `${daysRemaining} days`, { count: daysRemaining })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Main Two-Column Layout ── */}
        <div className="flex flex-col md:flex-row gap-5 lg:gap-8 items-start">
          {/* ── LEFT SIDEBAR (Width: w-full md:w-72 lg:w-80 space-y-4) ── */}
          <div className="w-full md:w-72 lg:w-80 flex-shrink-0 space-y-4">
            {/* Card 1: Account Navigation Menu */}
            <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-600" />
                  <h3 className="font-bold text-sm text-gray-900">{t('profile.accountMenu', 'Account Menu')}</h3>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">Hub</span>
              </div>

              <nav className="p-2 space-y-1">
                <button
                  onClick={() => selectTab('personal')}
                  className={`w-full flex items-center justify-between px-3.5 py-3 text-sm font-medium rounded-xl transition-all duration-150 ${
                    activeTab === 'personal'
                      ? 'bg-amber-50 text-amber-950 font-bold border-l-4 border-amber-500 shadow-xs'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${activeTab === 'personal' ? 'bg-amber-500 text-gray-950 font-bold' : 'bg-gray-100 text-gray-500'}`}>
                      <User className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <div className="leading-snug">{t('profile.personalInfo', 'Personal Info')}</div>
                      <div className="text-[10px] text-gray-400 font-normal">Contact & security</div>
                    </div>
                  </div>
                  <ChevronRight className={`h-4 w-4 ${activeTab === 'personal' ? 'text-amber-600' : 'text-gray-300'}`} />
                </button>

                <button
                  onClick={() => selectTab('listings')}
                  className={`w-full flex items-center justify-between px-3.5 py-3 text-sm font-medium rounded-xl transition-all duration-150 ${
                    activeTab === 'listings'
                      ? 'bg-amber-50 text-amber-950 font-bold border-l-4 border-amber-500 shadow-xs'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${activeTab === 'listings' ? 'bg-amber-500 text-gray-950 font-bold' : 'bg-gray-100 text-gray-500'}`}>
                      <List className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <div className="leading-snug">{t('profile.myListings', 'My Listings')}</div>
                      <div className="text-[10px] text-gray-400 font-normal">Active machinery adverts</div>
                    </div>
                  </div>
                  <ChevronRight className={`h-4 w-4 ${activeTab === 'listings' ? 'text-amber-600' : 'text-gray-300'}`} />
                </button>

                {canViewPaymentHistory && (
                  <button
                    onClick={() => selectTab('payments')}
                    className={`w-full flex items-center justify-between px-3.5 py-3 text-sm font-medium rounded-xl transition-all duration-150 ${
                      activeTab === 'payments'
                        ? 'bg-amber-50 text-amber-950 font-bold border-l-4 border-amber-500 shadow-xs'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${activeTab === 'payments' ? 'bg-amber-500 text-gray-950 font-bold' : 'bg-gray-100 text-gray-500'}`}>
                        <CreditCard className="h-4 w-4" />
                      </div>
                      <div className="text-left">
                        <div className="leading-snug">{t('profile.paymentHistory', 'Payment History')}</div>
                        <div className="text-[10px] text-gray-400 font-normal">Transactions & receipts</div>
                      </div>
                    </div>
                    <ChevronRight className={`h-4 w-4 ${activeTab === 'payments' ? 'text-amber-600' : 'text-gray-300'}`} />
                  </button>
                )}

                <button
                  onClick={() => selectTab('applications')}
                  className={`w-full flex items-center justify-between px-3.5 py-3 text-sm font-medium rounded-xl transition-all duration-150 ${
                    activeTab === 'applications'
                      ? 'bg-amber-50 text-amber-950 font-bold border-l-4 border-amber-500 shadow-xs'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${activeTab === 'applications' ? 'bg-amber-500 text-gray-950 font-bold' : 'bg-gray-100 text-gray-500'}`}>
                      <Briefcase className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <div className="leading-snug">{t('profile.myApplications', 'My Applications')}</div>
                      <div className="text-[10px] text-gray-400 font-normal">Job applications status</div>
                    </div>
                  </div>
                  <ChevronRight className={`h-4 w-4 ${activeTab === 'applications' ? 'text-amber-600' : 'text-gray-300'}`} />
                </button>
              </nav>
            </div>

            {/* Machinery Support Desk */}
            <div className="rounded-2xl border border-gray-200/80 bg-white p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
                  <HelpCircle size={15} />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900">Equipment Helpline</h3>
                  <p className="text-[10px] text-gray-400 font-medium">Machine Advisors Available</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-3.5">
                Need help with machine inspection, finance options, or transportation?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={supportCallHref || undefined}
                  aria-disabled={!supportCallHref}
                  tabIndex={supportCallHref ? undefined : -1}
                  onClick={(event) => {
                    if (!supportCallHref) {
                      event.preventDefault();
                    }
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-800 transition-colors ${
                    supportCallHref ? 'hover:bg-gray-100' : 'cursor-not-allowed opacity-50'
                  }`}
                  title={supportCallHref ? 'Call the configured support number' : 'Support phone number is not configured'}
                >
                  <Phone size={13} className="text-gray-600" />
                  <span>Call Desk</span>
                </a>
                <a
                  href={supportWhatsappHref || undefined}
                  aria-disabled={!supportWhatsappHref}
                  tabIndex={supportWhatsappHref ? undefined : -1}
                  onClick={(event) => {
                    if (!supportWhatsappHref) {
                      event.preventDefault();
                    }
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition-colors ${
                    supportWhatsappHref ? 'hover:bg-emerald-100' : 'cursor-not-allowed opacity-50'
                  }`}
                  title={supportWhatsappHref ? 'Open the configured support WhatsApp' : 'Support WhatsApp number is not configured'}
                >
                  <MessageCircle size={13} className="text-emerald-600" />
                  <span>WhatsApp</span>
                </a>
              </div>
            </div>
          </div>

          {/* ── RIGHT CONTENT TABS ── */}
          <div className="flex-1 min-w-0 w-full mb-8 sm:mb-0">
            {activeTab === 'personal' && <PersonalInfoTab />}
            {activeTab === 'listings' && <MyListingsTab />}
            {activeTab === 'payments' && <PaymentHistoryTab />}
            {activeTab === 'applications' && <MyApplicationsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
