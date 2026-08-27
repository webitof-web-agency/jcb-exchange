'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { FileCheck2, LayoutDashboard, LogOut, ChevronDown, User as UserIcon, Truck, MessagesSquare, Bell, CheckCheck, X, Menu } from 'lucide-react';
import api from '@/lib/api';
import AccountAccessInactive from '@/components/auth/AccountAccessInactive';
import AccountAccessRevoked from '@/components/auth/AccountAccessRevoked';
import PortalBrand from '@/components/layout/PortalBrand';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useTranslation } from '@/hooks/useTranslation';
import { formatDateTime } from '@/lib/i18n/formatters';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { isInactiveAccessError, isRevokedAccessError } from '@/lib/sessionAccess';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';

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
  const [isSessionChecking, setIsSessionChecking] = useState(true);
  const hasCompletedInitialSessionCheck = useRef(false);
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
        await fetchNotifications();
        const badgeRes = await api.get('/leads/badges');
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
    const interval = window.setInterval(syncNotifications, 5000);
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
      if (!hasCompletedInitialSessionCheck.current) {
        setIsSessionChecking(true);
      }

      try {
        const response = await api.get('/auth/profile');

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

        logout();
        router.replace('/login');
      } finally {
        if (isMounted && !hasCompletedInitialSessionCheck.current) {
          setIsSessionChecking(false);
          hasCompletedInitialSessionCheck.current = true;
        }
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">
          {t('partner.loadingSession')}
        </div>
      </div>
    );
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

  const navItems = [
    { href: '/partner/dashboard', label: t('partner.dashboard'), icon: LayoutDashboard, disabled: !isApproved },
    { href: '/partner/listings', label: t('partner.listings'), icon: Truck, disabled: !isApproved },
    { href: '/partner/leads', label: t('partner.enquiries'), icon: MessagesSquare, disabled: !isApproved },
    { href: '/partner/kyc', label: t('partner.onboarding'), icon: FileCheck2 }
  ];

  const displayName = user.name || user.email || t('partner.partnerAccount');
  const pageTitleMap: Record<string, string> = {
    '/partner/dashboard': t('partner.partnerDashboard'),
    '/partner/listings': t('partner.myListings'),
    '/partner/leads': t('partner.enquiryManagement'),
    '/partner/profile': t('partner.myProfilePage'),
    '/partner/kyc': t('partner.partnerOnboarding'),
  };
  const pageTitle = pageTitleMap[pathname] || t('partner.partnerDashboard');
  const profileHref = '/partner/profile';

  if (isSessionChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">
          {t('partner.verifyingSession')}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
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

      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#1A1A1A] text-white flex flex-col shrink-0 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 sm:p-6 border-b border-white/10 relative">
          <div>
            <PortalBrand href="/partner/dashboard" subtitle={t('partner.partnerPortal')} />
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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
                className={`flex items-center justify-between px-4 py-2.5 rounded-lg transition-all duration-200 ${
                  item.disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
                } ${
                  isActive
                    ? 'border border-[#FFC107] text-white bg-[#FFC107]/5 font-semibold'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Icon className={`w-5 h-5 ${isActive ? 'text-[#FFC107]' : ''}`} />
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

        <div className="border-t border-white/10 px-6 py-5 shrink-0">
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-semibold text-white truncate">{displayName}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-gray-400">
              {formatPartnerTypeLabel(user.partnerType, translatedOnboardingStatus || t('partner.onboarding'))}
            </p>
            <p className="mt-3 text-xs text-gray-400">
              {isApproved ? t('partner.accountApproved') : t('partner.completeOnboarding')}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 border border-[#FFC107] text-[#FFC107] hover:bg-[#FFC107]/10 py-2.5 rounded-lg transition-colors font-medium"
          >
            <LogOut className="w-5 h-5" />
            <span>{t('common.logout')}</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
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
                      <div className="max-h-[300px] overflow-y-auto">
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
                    </div>
                  </>
                )}
              </div>

              <div className="w-px h-8 bg-gray-200"></div>

              {/* Profile Dropdown */}
              <div className="relative shrink-0 ml-2">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-2 sm:gap-3 focus:outline-none hover:bg-gray-50 p-1 sm:p-1.5 sm:pr-3 rounded-full transition-colors border border-transparent hover:border-gray-200"
                >
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-gray-900">{displayName}</p>
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                      {formatPartnerTypeLabel(user.partnerType, translatedPartnerRoleLabel)}
                    </span>
                  </div>
                  <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-700">
                    {(user.name || user.email || 'P').charAt(0).toUpperCase()}
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <>
                    {/* Transparent overlay to detect outside clicks */}
                    <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />

                    <div className="absolute right-0 top-full mt-2 z-50 w-64 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] transform origin-top-right transition-all duration-200 ease-out">
                    <div className="border-b border-gray-100 bg-white px-5 py-4">
                      <p className="text-sm font-bold text-gray-900 truncate">{displayName}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">{user.email || t('common.partnerEmailFallback')}</p>
                    </div>
                    <div className="p-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          router.push(profileHref);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-colors group"
                      >
                        <UserIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                        <span>{t('common.myProfile')}</span>
                      </button>

                      <div className="my-1.5 mx-2 h-px bg-gray-100"></div>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors group"
                      >
                        <LogOut className="w-4 h-4 text-red-500 group-hover:text-red-600" />
                        <span>{t('common.logoutSecurely')}</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
