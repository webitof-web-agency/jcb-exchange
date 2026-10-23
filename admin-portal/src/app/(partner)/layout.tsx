'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CreditCard, FileCheck2, LayoutDashboard, LogOut, ChevronDown, User as UserIcon, Truck, MessagesSquare, Bell, CheckCheck, X, Menu, BarChart3, CheckCircle2, ChevronRight, Clock, ArrowRight } from 'lucide-react';
import api from '@/lib/api';
import AccountAccessInactive from '@/components/auth/AccountAccessInactive';
import AccountAccessRevoked from '@/components/auth/AccountAccessRevoked';
import PortalBrand from '@/components/layout/PortalBrand';
import BrandLoader from '@/components/ui/BrandLoader';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useTranslation } from '@/hooks/useTranslation';
import { formatDateTime } from '@/lib/i18n/formatters';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { isDefinitiveSessionFailure, isInactiveAccessError, isRevokedAccessError } from '@/lib/sessionAccess';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import PushNotificationManager from '@/components/shared/PushNotificationManager';
import { UserAvatar } from '@/components/profile/AvatarUpload';

interface PartnerNotification {
  id: string;
  title: string;
  message: string;
  link?: string | null;
  type?: string | null;
  isRead: boolean;
  createdAt: string;
}

const partnerIsApproved = (user: { accountStatus?: string | null; onboardingStatus?: string | null; kycStatus?: string | null } | null) =>
  user?.accountStatus === 'ACTIVE' && user?.onboardingStatus === 'APPROVED' && user?.kycStatus === 'APPROVED';

const canAccessPartnerOnboarding = (role?: string | null) => role === 'PARTNER' || role === 'CUSTOMER';

const formatPartnerLabel = (value?: string | null) =>
  value
    ? value
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : null;

export default function PartnerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { customHeader } = useHeaderStore();
  const { isAuthenticated, user, logout, hasHydrated, hydrateAuth, updateUser } = useAuthStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isAccessRevoked, setIsAccessRevoked] = useState(false);
  const [isAccessInactive, setIsAccessInactive] = useState(false);
  const isApproved = partnerIsApproved(user);
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [notifications, setNotifications] = useState<PartnerNotification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState<PartnerNotification | null>(null);
  const hasLoadedNotifications = useRef(false);
  const lastSeenNotificationId = useRef<string | null>(null);
  const unreadCount = notifications.length;

  const [badges, setBadges] = useState<{
    enquiries: number;
  }>({
    enquiries: 0,
  });

  const [clearedBadges, setClearedBadges] = useState<{
    enquiries: number;
  }>({
    enquiries: 0,
  });
  const translatedPartnerRoleLabel =
    user?.role === 'PARTNER'
      ? t('common.partner')
      : user?.role === 'CUSTOMER'
        ? t('common.customer')
        : formatPartnerLabel(user?.role) || t('common.notAvailable');
  const translatedOnboardingStatus = user?.onboardingStatus
    ? user.onboardingStatus === 'APPROVED'
      ? t('common.approved')
      : user.onboardingStatus === 'PENDING'
        ? t('common.pending')
        : user.onboardingStatus === 'REJECTED'
          ? t('common.rejected')
          : user.onboardingStatus === 'CHANGES_REQUESTED'
            ? t('common.changesRequested')
            : formatPartnerLabel(user.onboardingStatus)
    : null;

  const fetchNotifications = async () => {
    const res = await api.get<{ success: boolean; data: PartnerNotification[] }>('/notifications', {
      params: { status: 'unread' },
    });
    if (res.data?.success) {
      const latestNotifications = res.data.data;
      const latestUnreadNotification = latestNotifications[0] || null;

      if (!hasLoadedNotifications.current) {
        hasLoadedNotifications.current = true;
        lastSeenNotificationId.current = latestUnreadNotification?.id || latestNotifications[0]?.id || null;
      } else if (
        latestUnreadNotification &&
        latestUnreadNotification.id !== lastSeenNotificationId.current
      ) {
        setToastNotification(latestUnreadNotification);
        lastSeenNotificationId.current = latestUnreadNotification.id;
      } else if (!latestUnreadNotification && latestNotifications[0]?.id) {
        lastSeenNotificationId.current = latestNotifications[0].id;
      }

      setNotifications(latestNotifications);
    }
  };

  useEffect(() => {
    if (!toastNotification) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastNotification(null);
    }, 4500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastNotification]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'PARTNER') return;

    const syncNotifications = async () => {
      try {
        const [, badgeRes] = await Promise.all([
          fetchNotifications(),
          api.get('/leads/badges'),
        ]);
        if (badgeRes.data?.badges) {
          const backendEnquiries = badgeRes.data.badges.enquiries || 0;
          let currentCleared = parseInt(localStorage.getItem(`cleared_enquiries_${user.id}`) || '0');

          if (backendEnquiries < currentCleared) {
            currentCleared = backendEnquiries;
            localStorage.setItem(`cleared_enquiries_${user.id}`, currentCleared.toString());
          }

          setClearedBadges({ enquiries: currentCleared });
          setBadges(badgeRes.data.badges);
        }
      } catch {}
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncNotifications();
      }
    };

    const handleFocus = () => {
      void syncNotifications();
    };

    void syncNotifications();
    const interval = window.setInterval(syncNotifications, 30000);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, user?.id, user?.role]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    if (pathname.startsWith('/partner/leads')) {
      const backendEnquiries = badges.enquiries;
      if (backendEnquiries > clearedBadges.enquiries) {
        localStorage.setItem(`cleared_enquiries_${user.id}`, backendEnquiries.toString());
        const nextClearedEnquiries = backendEnquiries;
        window.setTimeout(() => {
          setClearedBadges((prev) => ({ ...prev, enquiries: nextClearedEnquiries }));
        }, 0);
      }

      const unreadLeadNotifs = notifications.filter(
        (n) => n.link && pathname.startsWith(n.link)
      );

      if (unreadLeadNotifs.length > 0) {
        unreadLeadNotifs.forEach((n) => {
          api.put(`/notifications/${n.id}/read`).catch(() => {});
        });
        window.setTimeout(() => {
          setNotifications((prev) =>
            prev.filter((n) => !(n.link && pathname.startsWith(n.link)))
          );
        }, 0);
      }
    }
  }, [pathname, isAuthenticated, user?.id, badges.enquiries, clearedBadges.enquiries, notifications]);

  // Prevent document/window scroll so layout remains 100% viewport locked
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  const markAsRead = async (id: string, link?: string) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) => prev.filter((notification) => notification.id !== id));
      setIsNotificationsOpen(false);
      if (link) {
        router.push(link);
      }
    } catch {}
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications([]);
    } catch {}
  };

  useEffect(() => {
    if (!hasHydrated) {
      hydrateAuth();
    }
  }, [hasHydrated, hydrateAuth]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (isAccessRevoked || isAccessInactive) {
      return;
    }

    if (!isAuthenticated || !canAccessPartnerOnboarding(user?.role)) {
      router.replace('/login');
      return;
    }

    if (!isApproved && pathname !== '/partner/kyc' && pathname !== '/partner/profile') {
      router.replace('/partner/kyc');
      return;
    }
  }, [hasHydrated, isAccessInactive, isAccessRevoked, isApproved, isAuthenticated, pathname, router, user]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !canAccessPartnerOnboarding(user?.role)) {
      return;
    }

    let isMounted = true;

    const verifySession = async () => {
      try {
        // A health check must not hold the form hostage to a transient backend
        // restart, network timeout, or database hiccup. Confirmed auth failures
        // are handled separately below.
        const response = await api.get('/auth/profile', { timeout: 10000 });

        if (!isMounted) {
          return;
        }

        updateUser(response.data.user);

        if (!canAccessPartnerOnboarding(response.data.user?.role)) {
          logout();
          router.replace('/login');
          return;
        }

        if (!partnerIsApproved(response.data.user) && pathname !== '/partner/kyc' && pathname !== '/partner/profile') {
          router.replace('/partner/kyc');
        }

        setIsAccessInactive(false);
        setIsAccessRevoked(false);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (isInactiveAccessError(error)) {
          logout();
          setIsAccessInactive(true);
          setIsAccessRevoked(false);
          return;
        }

        if (isRevokedAccessError(error)) {
          logout();
          setIsAccessRevoked(true);
          setIsAccessInactive(false);
          return;
        }

        if (isDefinitiveSessionFailure(error)) {
          logout();
          router.replace('/login');
        }
        // Keep the current session and form state for transient failures. The
        // next scheduled verification will retry without destroying local auth.
      }
    };

    verifySession();
    const intervalId = window.setInterval(verifySession, 60000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [hasHydrated, isAuthenticated, logout, pathname, router, user?.role, updateUser, user?.id]);

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  if (!hasHydrated) {
    return <BrandLoader variant="fullscreen" size="lg" bg="light" />;
  }

  if (isAccessRevoked) {
    return (
      <AccountAccessRevoked
        accountLabel={t('partner.portalAccount')}
        onRetry={() => router.replace('/login')}
      />
    );
  }

  if (isAccessInactive) {
    return (
      <AccountAccessInactive
        accountLabel={t('partner.portalAccount')}
        onRetry={() => router.replace('/login')}
      />
    );
  }

  if (!isAuthenticated || !canAccessPartnerOnboarding(user?.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">
          {t('partner.checkingAccess')}
        </div>
      </div>
    );
  }

  const isKycApproved = isApproved || user.kycStatus === 'APPROVED' || user.onboardingStatus === 'APPROVED';

  const navItems = [
    { href: '/partner/dashboard', label: t('partner.dashboard'), icon: LayoutDashboard, disabled: !isApproved },
    { href: '/partner/analytics', label: 'Analytics', icon: BarChart3, disabled: !isApproved },
    { href: '/partner/listings', label: t('partner.listings'), icon: Truck, disabled: !isApproved },
    { href: '/partner/leads', label: t('partner.enquiries'), icon: MessagesSquare, disabled: !isApproved },
    { href: '/partner/payments', label: 'Payments', icon: CreditCard, disabled: !isApproved },
    ...(!isKycApproved ? [{ href: '/partner/kyc', label: t('partner.onboarding'), icon: FileCheck2 }] : []),
  ];

  const displayName = user.name || user.email || t('partner.partnerAccount');
  const pageTitleMap: Record<string, string> = {
    '/partner/dashboard': t('partner.partnerDashboard'),
    '/partner/analytics': 'Performance Analytics',
    '/partner/listings': t('partner.myListings'),
    '/partner/leads': t('partner.enquiryManagement'),
    '/partner/payments': 'Listing Payments',
    '/partner/profile': t('partner.myProfilePage'),
    '/partner/kyc': t('partner.partnerOnboarding'),
    '/partner/notifications': t('common.notifications', 'Notification Center'),
  };
  const pageTitle = pageTitleMap[pathname] || t('partner.partnerDashboard');
  const profileHref = '/partner/profile';

  return (
    <div className="fixed inset-0 flex h-full w-full min-h-0 overflow-hidden bg-gray-100">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      {toastNotification ? (
        <div className="pointer-events-none fixed right-6 top-6 z-[80] w-full max-w-sm">
          <div className="pointer-events-auto overflow-hidden rounded-2xl border border-[#FFC107]/30 bg-white shadow-[0_16px_50px_-18px_rgba(0,0,0,0.3)]">
            <div className="h-1.5 bg-[#FFC107]" />
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9A7600]">{t('partner.newNotification')}</p>
                  <p className="mt-1 text-sm font-bold text-gray-900">{toastNotification.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setToastNotification(null)}
                  className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-sm text-gray-600">{toastNotification.message}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-400">
                  {formatDateTime(toastNotification.createdAt, locale)}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void markAsRead(toastNotification.id, toastNotification.link || undefined);
                    setToastNotification(null);
                  }}
                  className="rounded-lg bg-[#FFC107] px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-[#E5AD06]"
                >
                  {t('common.view')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 sm:w-[268px] bg-gradient-to-b from-[#00000d] via-[#00113b] to-[#00000d] border-r border-slate-800/80 text-white flex flex-col shrink-0 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 h-screen overflow-hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-4 py-3 border-b border-slate-800/80 relative flex items-center justify-between overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-8 bg-amber-400/10 blur-xl pointer-events-none rounded-full" />
          <div className="flex-1 min-w-0">
            <PortalBrand href="/partner/dashboard" subtitle={t('partner.partnerPortal')} maxHeightClassName="max-h-[58px]" />
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-1.5 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors ml-2 shrink-0"
            aria-label="Close Sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto custom-scrollbar-dark">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            let badgeCount = 0;
            if (item.href.includes('enquiries') || item.href.includes('leads')) {
              badgeCount = Math.max(0, badges.enquiries - clearedBadges.enquiries);
            }

            return (
              <Link
                key={item.href}
                href={item.disabled ? '#' : item.href}
                onClick={(e) => {
                  if (item.disabled) e.preventDefault();
                  setIsMobileMenuOpen(false);
                }}
                className={`group relative flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs transition-all duration-150 ${
                  item.disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
                } ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-400/15 via-amber-400/5 to-transparent text-[#FFC107] font-semibold border-l-[3px] border-[#FFC107] shadow-2xs'
                    : 'border-l-[3px] border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-[#FFC107]' : 'text-zinc-400 group-hover:text-zinc-200'}`} />
                    {badgeCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                      </span>
                    )}
                  </div>
                  <span>{item.label}</span>
                </div>
                {badgeCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800/80 px-4 py-3.5 shrink-0 bg-[#00000d]/95 backdrop-blur-xs">
          <Link
            href={profileHref}
            className={`group mb-3 block relative overflow-hidden rounded-xl border p-3.5 transition-all duration-200 shadow-md ${
              isApproved
                ? 'border-emerald-500/40 bg-gradient-to-b from-emerald-950/40 via-emerald-950/20 to-slate-900/80 hover:border-emerald-400/70 hover:shadow-emerald-950/50'
                : 'border-amber-500/40 bg-gradient-to-b from-amber-950/40 via-amber-950/20 to-slate-900/80 hover:border-amber-400/70 hover:shadow-amber-950/50'
            }`}
            title={t('partner.myProfilePage') || 'View Partner Profile'}
          >
            {/* Top glowing ambient highlight line */}
            <div
              className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${
                isApproved
                  ? 'from-transparent via-emerald-400 to-transparent'
                  : 'from-transparent via-amber-400 to-transparent'
              }`}
            />

            <div className="flex items-center gap-3">
              <div className="shrink-0 relative">
                <UserAvatar user={user} size="header" />
                {isApproved && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#00000d] text-slate-950">
                    <CheckCircle2 className="h-3 w-3 text-slate-950 stroke-[3]" />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-white truncate leading-tight group-hover:text-emerald-300 transition-colors">
                    {displayName}
                  </p>
                </div>

                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                      isApproved
                        ? 'bg-amber-400/15 text-[#FFC107] border border-amber-400/30'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {formatPartnerTypeLabel(user.partnerType, translatedOnboardingStatus || t('partner.onboarding'))}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Ribbon Pill */}
            <div
              className={`mt-3 flex items-center justify-between rounded-lg px-2.5 py-1.5 border text-xs transition-colors ${
                isApproved
                  ? 'bg-emerald-950/70 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-950/70 border-amber-500/30 text-amber-300'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isApproved ? (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                ) : (
                  <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                )}
                <span className="text-[11px] font-semibold truncate text-emerald-300">
                  {isApproved
                    ? t('partner.accountApproved') || 'Account approved and active.'
                    : t('partner.completeOnboarding') || 'Complete Onboarding'}
                </span>
              </div>

              <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
          </Link>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 border border-slate-700/80 hover:border-amber-400/60 bg-white/[0.03] hover:bg-[#FFC107]/10 text-slate-300 hover:text-[#FFC107] py-2 rounded-xl transition-all duration-200 text-xs font-semibold shadow-2xs"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('common.logout')}</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden">
        <header className="bg-white border-b border-gray-200 p-3 sm:p-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg shrink-0"
            >
              <Menu className="w-6 h-6" />
            </button>
            {customHeader || <h1 className="font-bold text-[17px] sm:text-xl text-gray-900 truncate">{pageTitle}</h1>}
          </div>
          <div className="relative flex items-center gap-2 sm:gap-4 shrink-0 ml-2">
              <LanguageSwitcher />
              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => {
                    const nextOpen = !isNotificationsOpen;
                    setIsNotificationsOpen(nextOpen);
                    if (nextOpen) {
                      void fetchNotifications();
                    }
                  }}
                  className="relative p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 rounded-full focus:outline-none"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsNotificationsOpen(false)} />
                    <div className="fixed left-4 right-4 top-[60px] md:absolute md:left-auto md:right-0 md:top-auto mt-2 z-50 w-auto md:w-80 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] transform origin-top-right transition-all duration-200 ease-out">
                      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-4 py-3">
                        <h3 className="text-sm font-bold text-gray-900">{t('common.notifications')}</h3>
                        {unreadCount > 0 && (
                          <button onClick={markAllAsRead} className="text-xs font-medium text-[#FFC107] hover:text-[#E5AD06] flex items-center gap-1">
                            <CheckCheck className="w-3 h-3" /> {t('common.markAllRead')}
                          </button>
                        )}
                      </div>
                      <div className="max-h-[300px] overflow-y-auto custom-scrollbar pr-0.5">
                        {notifications.length === 0 ? (
                          <div className="px-4 py-8 text-center text-sm text-gray-500">
                            {t('common.noNotifications')}
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {notifications.map((notif) => (
                              <div 
                                key={notif.id}
                                onClick={() => markAsRead(notif.id, notif.link || undefined)}
                                className="cursor-pointer bg-blue-50/30 px-4 py-3 transition-colors hover:bg-gray-50"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500"></div>
                                  <div>
                                    <p className="text-sm font-semibold text-gray-900">{notif.title}</p>
                                    <p className="mt-0.5 text-xs text-gray-500">{notif.message}</p>
                                    <p className="mt-1 text-[10px] text-gray-400">
                                      {formatDateTime(notif.createdAt, locale)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="border-t border-gray-100 bg-gray-50/90 p-2.5 text-center">
                        <Link
                          href="/partner/notifications"
                          onClick={() => setIsNotificationsOpen(false)}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 px-3 text-xs font-bold text-slate-700 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          <span>{t('notifications.viewAll', 'View all notifications')}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="w-px h-8 bg-gray-200"></div>

              {/* Profile Dropdown */}
              <div className="relative shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className={`group flex items-center gap-2 sm:gap-2.5 rounded-xl border px-2 sm:px-2.5 py-1 sm:py-1.5 transition-all duration-150 focus:outline-none select-none ${
                    isDropdownOpen
                      ? 'border-amber-400 bg-amber-50/50 shadow-xs ring-2 ring-amber-400/20'
                      : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/80 shadow-2xs'
                  }`}
                  aria-expanded={isDropdownOpen}
                  aria-haspopup="true"
                  title={`${displayName}`}
                >
                  <div className="text-right hidden sm:flex flex-col items-end justify-center min-w-0">
                    <span className="text-xs font-bold text-slate-900 tracking-tight leading-tight truncate max-w-[130px] group-hover:text-slate-950">
                      {displayName}
                    </span>
                    <div className="mt-0.5 flex items-center">
                      <span className="inline-flex items-center rounded-sm bg-amber-100/90 px-1.5 py-0.25 text-[8.5px] font-black uppercase tracking-wider text-amber-950 border border-amber-200/80 leading-none">
                        {formatPartnerTypeLabel(user.partnerType, translatedPartnerRoleLabel)}
                      </span>
                    </div>
                  </div>

                  <div className="relative shrink-0">
                    <UserAvatar user={user} size="header-compact" />
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1.5 ring-white shadow-2xs"
                      title="Active Session"
                    />
                  </div>

                  <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                      isDropdownOpen ? 'rotate-180 text-amber-700' : 'group-hover:text-slate-600'
                    }`}
                  />
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <>
                    {/* Transparent overlay to detect outside clicks */}
                    <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />

                    <div className="absolute right-0 top-full mt-2 z-50 w-68 bg-white border border-slate-200/90 rounded-2xl shadow-xl overflow-hidden divide-y divide-slate-100 transform origin-top-right transition-all duration-150 ease-out animate-in fade-in zoom-in-95">
                    <div className="px-4 py-3.5 bg-gradient-to-b from-slate-50/90 to-white flex items-center gap-3">
                      <div className="relative shrink-0">
                        <UserAvatar user={user} size="header" />
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold text-slate-900 truncate">{displayName}</p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{user.email || t('common.partnerEmailFallback')}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="inline-flex items-center rounded-sm bg-amber-100 px-1.5 py-0.25 text-[8.5px] font-black uppercase tracking-wider text-amber-950 border border-amber-200">
                            {formatPartnerTypeLabel(user.partnerType, translatedPartnerRoleLabel)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="p-1.5 space-y-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          router.push(profileHref);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-slate-950 rounded-lg transition-colors group"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserIcon className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
                          <span className="font-semibold">{t('common.myProfile')}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">Account</span>
                      </button>
                    </div>
                    <div className="p-1.5">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors group"
                      >
                        <LogOut className="w-4 h-4 text-rose-500 group-hover:text-rose-600 transition-colors" />
                        <span>{t('common.logoutSecurely')}</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <div className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto custom-scrollbar bg-gray-100 overscroll-contain pb-8">{children}</div>
      </main>
      <PushNotificationManager />
    </div>
  );
}
