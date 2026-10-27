"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, ChevronDown, LogOut, Package, User, Menu, X, Home, Truck, PlusCircle, CheckCircle2, Store, Tag, Briefcase, BookOpen, ShoppingCart } from 'lucide-react';
import SellVehicleModal from '@/components/sell/SellVehicleModal';
import CustomerPrimePaymentModal from '@/components/payments/CustomerPrimePaymentModal';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';
import SiteBrand from '@/components/layout/SiteBrand';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { getPortalMenuLabel, getPortalTarget, getPublicRoleLabel, PORTAL_ROLES } from '@/lib/portal';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { formatDateTime } from '@/lib/i18n/formatters';
import { getNotificationHref } from '@/lib/notificationNavigation';
import { isReactNativeWebView } from '@/lib/nativeApp';
import { getAuthDisplayName } from '@/lib/authDisplayName';

type ProfileResponse = {
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    role?: string;
    rawRole?: string;
    status?: string | null;
    ownerName?: string | null;
    onboardingStatus?: string | null;
    accountStatus?: string | null;
    kycStatus?: string | null;
    partnerType?: string | null;
    businessAddress?: string | null;
    district?: string | null;
    pinCode?: string | null;
    contactPreference?: string | null;
    city?: string | null;
    state?: string | null;
    mobile?: string | null;
    whatsappNumber?: string | null;
    isVerifiedPartner?: boolean;
    isPrimeCustomer?: boolean;
    customerCategory?: string | null;
    primeSubscriptionExpiresAt?: string | null;
    portalHomeRoute?: string | null;
  };
};

const subscribeToNativeBridge = () => () => undefined;

export default function Navbar() {
  const { locale, t } = useTranslation();
  const {
    setAuthModalOpen,
    isAuthenticated,
    user,
    token,
    logout,
    hasHydrated,
    hydrateAuth,
  } = useAuthStore();

  const {
    notifications,
    unreadCount,
    initialize,
    fetchRecentListings,
    fetchNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
  } = useNotificationStore();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [isPrimePaymentOpen, setIsPrimePaymentOpen] = useState(false);
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const [playStoreLink, setPlayStoreLink] = useState<string | null>(null);
  const [appStoreLink, setAppStoreLink] = useState<string | null>(null);
  const isWebView = useSyncExternalStore(
    subscribeToNativeBridge,
    () => isReactNativeWebView(window),
    () => false,
  );
  const pathname = usePathname();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileNotificationsRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const lastScrollYRef = useRef(0);
  const tickingRef = useRef(false);
  const hasBlockingModalOpen = isSellModalOpen || isPrimePaymentOpen;
  const shouldShowNavbar = hasBlockingModalOpen || isNavbarVisible;

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    api.get('/master/mobile-app')
      .then(res => {
        if (res.data?.success) {
          setPlayStoreLink(res.data.data.playStoreLink);
          setAppStoreLink(res.data.data.appStoreLink);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (hasBlockingModalOpen) {
      return;
    }

    lastScrollYRef.current = window.scrollY;

    const updateNavbarVisibility = () => {
      const currentScrollY = window.scrollY;
      const previousScrollY = lastScrollYRef.current;
      const scrollDelta = currentScrollY - previousScrollY;

      if (currentScrollY <= 80) {
        setIsNavbarVisible(true);
      } else if (scrollDelta > 4) {
        setIsNavbarVisible(false);
      } else if (scrollDelta < -4) {
        setIsNavbarVisible(true);
      }

      lastScrollYRef.current = currentScrollY;
      tickingRef.current = false;
    };

    const handleScroll = () => {
      if (tickingRef.current) {
        return;
      }

      tickingRef.current = true;
      window.requestAnimationFrame(updateNavbarVisibility);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [hasBlockingModalOpen]);

  useEffect(() => {
    if (!hasHydrated) {
      hydrateAuth();
    }
  }, [hasHydrated, hydrateAuth]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !token || !user) {
      return;
    }

    let cancelled = false;

    const syncAuthenticatedUser = async () => {
      if (user.role !== 'CUSTOMER') {
        return;
      }

      try {
        const response = await api.get<ProfileResponse>('/auth/profile');
        if (cancelled) {
          return;
        }

        if (response.data?.user) {
          useAuthStore.getState().setAuth(token, {
            ...user,
            ...response.data.user,
          });
        }
      } catch (error) {
        console.error('Failed to sync authenticated user', error);
      }
    };

    void syncAuthenticatedUser();

    const interval = window.setInterval(() => {
      void syncAuthenticatedUser();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hasHydrated, isAuthenticated, token, user]);

  useEffect(() => {
    initialize();
    void fetchRecentListings();

    const interval = setInterval(() => {
      void fetchRecentListings();
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchRecentListings, initialize]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || user?.role !== 'CUSTOMER') {
      return;
    }

    void fetchNotifications();

    const interval = setInterval(() => {
      void fetchNotifications();
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchNotifications, hasHydrated, isAuthenticated, user?.role]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideNotificationSurface =
        dropdownRef.current?.contains(target) || mobileNotificationsRef.current?.contains(target);

      if (!clickedInsideNotificationSurface) {
        setIsDropdownOpen(false);
      }

      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleDropdown = () => {
    const nextOpen = !isDropdownOpen;
    setIsDropdownOpen(nextOpen);

    if (nextOpen && hasHydrated && isAuthenticated && user?.role === 'CUSTOMER') {
      void fetchNotifications();
    }
  };

  const handleNotificationClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    notification: { id: string; link?: string | null },
  ) => {
    event.preventDefault();
    setIsDropdownOpen(false);
    void markNotificationAsRead(notification.id);
    router.push(getNotificationHref(notification.link));
  };

  const handleNotificationLogin = () => {
    setIsDropdownOpen(false);
    window.setTimeout(() => setAuthModalOpen(true), 0);
  };

  const displayName = getAuthDisplayName(user);
  const roleLabel = getPublicRoleLabel({
    role: user?.role,
    partnerType: user?.partnerType,
    isPrimeCustomer: user?.isPrimeCustomer,
  });
  const portalMenuLabel = getPortalMenuLabel(user?.role);
  const portalTarget = getPortalTarget({
    role: user?.role,
    token,
    fallbackPath: user?.portalHomeRoute || '/profile',
  });
  const handlePortalNavigation = () => {
    setIsProfileDropdownOpen(false);

    if (user?.role && PORTAL_ROLES.includes(user.role)) {
      window.location.assign(portalTarget);
      return;
    }
  };

  const handleOpenSellVehicle = () => {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    if (user?.role === 'CUSTOMER' && !user?.isPrimeCustomer) {
      setIsPrimePaymentOpen(true);
      return;
    }

    setIsSellModalOpen(true);
  };

  const isActivePath = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const navLinkClass = (active: boolean) =>
    `relative inline-flex h-10 cursor-pointer items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-jcb-yellow/60 2xl:px-3.5 ${active
      ? 'text-white after:absolute after:inset-x-3 after:-bottom-4 after:h-0.5 after:rounded-full after:bg-jcb-yellow'
      : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
    }`;

  const buyVehicleCta = (
    <Link
      href="/machines"
      className="hidden h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-jcb-yellow px-4 text-sm font-bold text-black shadow-[0_1px_0_0_rgba(255,255,255,0.35)_inset] transition-colors hover:bg-[#FFCA2C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jcb-yellow/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#00000d] md:inline-flex"
    >
      <ShoppingCart className="h-4 w-4" strokeWidth={2.25} />
      {t('navbar.buyVehicle', 'Buy Vehicle')}
    </Link>
  );

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-40 w-full border-b border-white/[0.08] bg-[#00000d] text-white lg:sticky lg:left-auto lg:right-auto ${hasBlockingModalOpen
            ? 'translate-y-0'
            : `transition-transform duration-300 ease-out will-change-transform ${shouldShowNavbar ? 'translate-y-0' : 'translate-y-0 lg:-translate-y-full'}`
          }`}
      >
        <div className="relative mx-auto flex h-[52px] w-full max-w-[1600px] items-center justify-between gap-4 px-2 sm:px-4 lg:h-[72px] lg:px-6 xl:px-8">
          <div className="flex flex-1 items-center gap-1 sm:gap-2 xl:flex-none">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-white/[0.06] hover:text-white xl:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle mobile menu"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-navigation-drawer"
            >
              {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <div className="hidden w-24 md:block lg:w-[150px]">
              <SiteBrand />
            </div>
          </div>

          {/* Mobile Centered Logo */}
          <div className="md:hidden absolute left-1/2 top-1/2 w-24 -translate-x-1/2 -translate-y-1/2 flex justify-center">
            <SiteBrand align="center" />
          </div>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 2xl:gap-1 xl:flex" aria-label="Main">
            <Link href="/machines" className={navLinkClass(isActivePath('/machines'))}>
              {t('navbar.machines')}
            </Link>
            <button type="button" onClick={handleOpenSellVehicle} className={navLinkClass(false)}>
              {t('navbar.sellVehicle')}
            </button>
            <Link href="/sold-vehicles" className={navLinkClass(isActivePath('/sold-vehicles'))}>
              {t('navbar.soldVehicles')}
            </Link>
            <Link href="/dealers" className={navLinkClass(isActivePath('/dealers'))}>
              {t('common.findDealer')}
            </Link>
            <Link href="/jobs" className={navLinkClass(isActivePath('/jobs'))}>
              {t('navbar.careers', 'Careers')}
            </Link>
            <Link href="/blog" className={navLinkClass(isActivePath('/blog'))}>
              {t('navbar.blog', 'Blog')}
            </Link>
          </nav>

          <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={handleToggleDropdown}
                  className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06] hover:text-white ${isDropdownOpen ? 'bg-white/[0.06] text-white' : 'text-gray-300'}`}
                  aria-label="Open notifications"
                >
                  <Bell className="h-5 w-5" strokeWidth={2} />
                  {isAuthenticated && user?.role === 'CUSTOMER' && unreadCount > 0 ? (
                    <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-jcb-yellow px-1 text-[9px] font-extrabold leading-none text-black ring-2 ring-[#00000d]">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  ) : null}
                </button>

                {/* Desktop popover — absolute, only visible on sm+ */}
                {isDropdownOpen && (
                  <div className="hidden sm:flex absolute right-0 top-full z-50 mt-3 w-96 rounded-xl border border-gray-100 bg-white text-gray-800 shadow-xl flex-col overflow-hidden" style={{ maxHeight: '480px' }}>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-4 py-3 rounded-t-xl flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-gray-900">{t('common.notifications')}</h3>
                        {isAuthenticated && user?.role === 'CUSTOMER' && unreadCount > 0 && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-jcb-yellow px-1.5 text-[10px] font-extrabold text-black">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {notifications.length > 0 && isAuthenticated && (
                          <button type="button" onClick={() => void markAllNotificationsAsRead()} className="text-xs font-semibold text-[#9A7600] hover:text-[#7A5F00] transition-colors">
                            {t('common.markAllRead')}
                          </button>
                        )}
                        <Link href="/notifications" onClick={() => setIsDropdownOpen(false)} className="text-xs font-semibold text-blue-600 hover:underline">
                          {t('common.viewAll')}
                        </Link>
                      </div>
                    </div>
                    {/* Body */}
                    <div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                      {!isAuthenticated || user?.role !== 'CUSTOMER' ? (
                        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Package className="h-6 w-6" /></div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800 mb-1">{t('common.loginToViewNotifications')}</p>
                            <p className="text-xs text-gray-500">Login as a customer to see your notifications</p>
                          </div>
                          <button type="button" onClick={handleNotificationLogin} className="rounded-lg bg-jcb-yellow px-5 py-2 text-sm font-bold text-black transition-all hover:bg-yellow-400">
                            Login / Sign Up
                          </button>
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400"><Package className="h-6 w-6" /></div>
                          <p className="text-sm font-medium text-gray-500">{t('common.noNotifications')}</p>
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <Link href={getNotificationHref(notification.link)} key={notification.id}
                            onClick={(event) => handleNotificationClick(event, notification)}
                            className="flex items-start gap-3 border-b border-gray-50 bg-[#FFF9E6] p-3 transition-colors hover:bg-amber-50/60">
                            <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#FFF3CD] text-[#9A7600]"><Package size={15} /></div>
                            <div className="flex-1 min-w-0">
                              <p className="line-clamp-1 text-xs font-bold text-gray-900">{notification.title}</p>
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-600">{notification.message}</p>
                              <p className="mt-1 text-[10px] text-gray-400">{formatDateTime(notification.createdAt, locale)}</p>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Mobile bottom sheet — portaled to document.body to avoid fixed-position issues */}
                {isDropdownOpen && typeof document !== 'undefined' && createPortal(
                  <div className="sm:hidden">
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm" onClick={() => setIsDropdownOpen(false)} />
                    {/* Sheet */}
                    <div ref={mobileNotificationsRef} className="fixed bottom-0 left-0 right-0 z-[10000] flex flex-col rounded-t-2xl bg-white text-gray-800 shadow-2xl" style={{ maxHeight: '82vh' }}>
                      {/* Drag handle */}
                      <div className="flex flex-shrink-0 justify-center pt-3 pb-1">
                        <div className="h-1 w-10 rounded-full bg-gray-300" />
                      </div>
                      {/* Header */}
                      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-gray-900">{t('common.notifications')}</h3>
                          {isAuthenticated && user?.role === 'CUSTOMER' && unreadCount > 0 && (
                            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-jcb-yellow px-1.5 text-[10px] font-extrabold text-black">
                              {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {notifications.length > 0 && isAuthenticated && (
                            <button type="button" onClick={() => void markAllNotificationsAsRead()} className="text-xs font-semibold text-[#9A7600] hover:text-[#7A5F00]">
                              {t('common.markAllRead')}
                            </button>
                          )}
                          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setIsDropdownOpen(false); }} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors" aria-label="Close">
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                      {/* Body */}
                      <div className="flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        {!isAuthenticated || user?.role !== 'CUSTOMER' ? (
                          <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Package className="h-7 w-7" /></div>
                            <div>
                              <p className="text-sm font-semibold text-gray-800 mb-1">{t('common.loginToViewNotifications')}</p>
                              <p className="text-xs text-gray-500">Login as a customer to see your notifications</p>
                            </div>
                            <button type="button" onClick={handleNotificationLogin} className="rounded-lg bg-jcb-yellow px-5 py-2.5 text-sm font-bold text-black transition-all hover:bg-yellow-400 active:scale-95">
                              Login / Sign Up
                            </button>
                          </div>
                        ) : notifications.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400"><Package className="h-7 w-7" /></div>
                            <p className="text-sm font-medium text-gray-500">{t('common.noNotifications')}</p>
                          </div>
                        ) : (
                          notifications.map((notification) => (
                            <Link href={getNotificationHref(notification.link)} key={notification.id}
                              onClick={(event) => handleNotificationClick(event, notification)}
                              className="flex items-start gap-3 border-b border-gray-50 bg-[#FFF9E6] p-4 transition-colors hover:bg-amber-50/60 active:bg-amber-100">
                              <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#FFF3CD] text-[#9A7600]"><Package size={16} /></div>
                              <div className="flex-1 min-w-0">
                                <p className="line-clamp-1 text-sm font-bold text-gray-900">{notification.title}</p>
                                <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{notification.message}</p>
                                <p className="mt-1.5 text-[11px] text-gray-400">{formatDateTime(notification.createdAt, locale)}</p>
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                      {/* Footer */}
                      {isAuthenticated && notifications.length > 0 && (
                        <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3">
                          <Link href="/notifications" onClick={() => setIsDropdownOpen(false)}
                            className="flex w-full items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-100 transition-colors">
                            View All Notifications
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>,
                  document.body
                )}

              </div>

              <div className="hidden md:block">
                <LanguageSwitcher size="compact" />
              </div>

              <span className="mx-1.5 hidden h-6 w-px bg-white/10 md:block" aria-hidden="true" />

              {isAuthenticated ? (
                <>
                {buyVehicleCta}
                <div className="relative md:ml-1" ref={profileDropdownRef}>
                  <button
                    onClick={() => setIsProfileDropdownOpen((current) => !current)}
                    className={`flex h-10 items-center gap-2.5 rounded-lg pl-1 pr-1 sm:pr-2.5 transition-colors hover:bg-white/[0.06] ${isProfileDropdownOpen ? 'bg-white/[0.06]' : ''}`}
                    aria-label="Open account menu"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-jcb-yellow/15 text-sm font-bold text-jcb-yellow ring-1 ring-jcb-yellow/40">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
                      <span className="max-w-[120px] truncate text-[13px] font-semibold text-white">{displayName}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        {roleLabel}
                      </span>
                    </div>
                    <ChevronDown className={`hidden h-4 w-4 text-gray-400 transition-transform duration-200 md:block ${isProfileDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isProfileDropdownOpen ? (
                    <div className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-xl border border-gray-100 bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] transition-all duration-200 ease-out">
                      <div className="border-b border-gray-100 bg-white px-5 py-4">
                        <p className="truncate text-sm font-bold text-gray-900">{displayName}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{user?.email || user?.mobile || 'Customer account'}</p>
                      </div>
                      <div className="p-1.5">
                        {user?.role && PORTAL_ROLES.includes(user.role) ? (
                          <button
                            type="button"
                            onClick={handlePortalNavigation}
                            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                          >
                            <User className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                            <span>{portalMenuLabel}</span>
                          </button>
                        ) : (
                          <Link
                            href={portalTarget}
                            onClick={() => setIsProfileDropdownOpen(false)}
                            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                          >
                            <User className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                            <span>{portalMenuLabel}</span>
                          </Link>
                        )}
                        <div className="mx-2 my-1.5 h-px bg-gray-100"></div>
                        <button
                          onClick={logout}
                          className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
                        >
                          <LogOut className="h-4 w-4 text-red-500 group-hover:text-red-600" />
                          <span>{t('common.logoutSecurely')}</span>
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                </>
              ) : (
                <>
                <button
                  onClick={() => setAuthModalOpen(true)}
                  className="flex h-10 w-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-gray-300 transition-colors hover:bg-white/[0.06] hover:text-white md:w-auto md:border md:border-white/15 md:px-4 md:text-white md:hover:border-white/25"
                  aria-label={t('common.loginSignup')}
                >
                  <User className="h-5 w-5 md:h-4 md:w-4" strokeWidth={2} />
                  <span className="hidden whitespace-nowrap md:inline">{t('common.loginSignup')}</span>
                </button>
                {buyVehicleCta}
                </>
              )}
            </div>
          </div>
      </header>

      {/* Mobile Menu Backdrop Overlay */}
      {isMobileMenuOpen ? (
        <div
          className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-xs transition-opacity duration-300 xl:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      ) : null}

      {/* Mobile Slide-Over Navigation Drawer */}
      <aside
        id="mobile-navigation-drawer"
        aria-label="Mobile navigation"
        aria-hidden={!isMobileMenuOpen}
        className={`fixed inset-y-0 left-0 z-[10010] flex w-[290px] max-w-[85vw] flex-col bg-[#161616] text-white shadow-2xl transition-transform duration-300 ease-out xl:hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        {/* Drawer Header */}
        <div className="relative flex items-center justify-between border-b border-white/10 px-4 py-3 min-h-[60px]">
          <div className="flex items-center justify-start min-w-[85px] scale-[0.8] origin-left">
            <SiteBrand align="left" />
          </div>
          <div className="flex items-center gap-0">
            <LanguageSwitcher size="sm" />
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              className="rounded-full p-2 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Navigation Links with Icons */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <Link
            href="/machines"
            onClick={() => setIsMobileMenuOpen(false)}
            className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-jcb-yellow px-4 py-3 text-sm font-bold text-black transition-colors hover:bg-[#FFCA2C]"
          >
            <ShoppingCart size={18} strokeWidth={2.25} />
            <span>{t('navbar.buyVehicle', 'Buy Vehicle')}</span>
          </Link>

          <Link
            href="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${pathname === '/' ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
          >
            <Home size={18} className={pathname === '/' ? 'text-[#FFC107]' : 'text-gray-400'} />
            <span>{t('navbar.home')}</span>
          </Link>

          <Link
            href="/machines"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${isActivePath('/machines') ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
          >
            <Truck size={18} className={isActivePath('/machines') ? 'text-[#FFC107]' : 'text-gray-400'} />
            <span>{t('navbar.machines')}</span>
          </Link>

          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              handleOpenSellVehicle();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-gray-300 transition-colors hover:bg-white/5 hover:text-white text-left"
          >
            <PlusCircle size={18} className="text-gray-400" />
            <span>{t('navbar.sellVehicle')}</span>
          </button>

          <Link
            href="/sold-vehicles"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${pathname === '/sold-vehicles' ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
          >
            <CheckCircle2 size={18} className={pathname === '/sold-vehicles' ? 'text-[#FFC107]' : 'text-gray-400'} />
            <span>{t('navbar.soldVehicles')}</span>
          </Link>

          <Link
            href="/jobs"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${pathname === '/jobs' || pathname.startsWith('/jobs/') ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
          >
            <Briefcase size={18} className={pathname === '/jobs' || pathname.startsWith('/jobs/') ? 'text-[#FFC107]' : 'text-gray-400'} />
            <span>{t('navbar.careers', 'Careers')}</span>
          </Link>

          <Link
            href="/blog"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${pathname === '/blog' || pathname.startsWith('/blog/') ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
          >
            <BookOpen size={18} className={pathname === '/blog' || pathname.startsWith('/blog/') ? 'text-[#FFC107]' : 'text-gray-400'} />
            <span>{t('navbar.blog', 'Blog')}</span>
          </Link>

          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              setTimeout(() => setIsDropdownOpen(true), 50);
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors text-left ${pathname === '/notifications' ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
          >
            <Bell size={18} className={pathname === '/notifications' ? 'text-[#FFC107]' : 'text-gray-400'} />
            <span>{t('common.notifications', 'Notifications')}</span>
            {isAuthenticated && user?.role === 'CUSTOMER' && unreadCount > 0 && (
              <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-jcb-yellow px-1.5 text-[10px] font-extrabold text-black">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {isAuthenticated && (
            <Link
              href="/profile?tab=listings"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Tag size={18} className="text-gray-400" />
              <span>{t('nav.myListings', 'My Listings')}</span>
            </Link>
          )}

          <Link
            href="/dealers"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${pathname === '/dealers' ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
          >
            <Store size={18} className={pathname === '/dealers' ? 'text-[#FFC107]' : 'text-gray-400'} />
            <span>{t('common.findDealer')}</span>
          </Link>

          {isAuthenticated && (
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-red-500 transition-colors hover:bg-white/5 hover:text-red-400 text-left mt-1"
            >
              <LogOut size={18} className="text-red-500" />
              <span>{t('common.logoutSecurely')}</span>
            </button>
          )}

          {!isWebView && (
            <div className="mt-4 border-t border-white/10 px-3.5 pt-5 pb-6 flex flex-col gap-3">
              <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mb-1">
                {t('common.getOurApp', 'GET OUR APP')}
              </span>

              <a
                href={playStoreLink || 'https://play.google.com/store/apps'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 rounded-xl bg-[#1d4ed8] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1e40af]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
                  <path d="M3.609 1.814L13.791 12 3.61 22.186c-.368-.381-.61-.926-.61-1.545V3.359c0-.62.242-1.164.609-1.545z" fill="#00D2FF" />
                  <path d="M17.156 8.635l-3.365 3.365 3.365 3.365 3.823-2.178c.87-.496.87-1.306 0-1.802l-3.823-2.75z" fill="#FFD000" />
                  <path d="M13.791 12L3.609 1.814C4.04 1.377 4.72 1.258 5.37 1.628l11.786 7.007L13.791 12z" fill="#00F076" />
                  <path d="M13.791 12l3.365 3.365L5.37 22.372c-.65.37-1.33.251-1.761-.186L13.791 12z" fill="#FF3A44" />
                </svg>
                {t('common.downloadForAndroid', 'Download for Android')}
              </a>

              <a
                href={appStoreLink || 'https://apps.apple.com/app'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 rounded-xl bg-[#0f172a] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 shrink-0">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.93c.66-.8 1.11-1.92.99-3.04-.96.04-2.12.64-2.81 1.44-.61.71-1.15 1.86-1.01 2.97 1.08.08 2.17-.57 2.83-1.37z" />
                </svg>
                {t('common.downloadForIos', 'Download for iOS')}
              </a>

              <div className="mt-4 text-center">
                <p className="text-xs font-medium text-gray-500">
                  Developed by <span className="text-gray-300 font-semibold">webitof</span> <span className="text-red-500">❤️</span>
                </p>
              </div>
            </div>
          )}
        </nav>
      </aside>
      {isSellModalOpen ? <SellVehicleModal isOpen={isSellModalOpen} onClose={() => setIsSellModalOpen(false)} /> : null}
      {isPrimePaymentOpen ? (
        <CustomerPrimePaymentModal
          isOpen={isPrimePaymentOpen}
          feature="SELL_LISTING"
          onClose={() => setIsPrimePaymentOpen(false)}
          onAccessGranted={() => {
            setIsPrimePaymentOpen(false);
            setIsSellModalOpen(true);
          }}
        />
      ) : null}
    </>
  );
}
