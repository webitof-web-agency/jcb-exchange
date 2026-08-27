"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, ChevronDown, LogOut, Package, User, Menu, X } from 'lucide-react';
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const lastScrollYRef = useRef(0);
  const tickingRef = useRef(false);
  const hasBlockingModalOpen = isSellModalOpen || isPrimePaymentOpen;
  const shouldShowNavbar = hasBlockingModalOpen || isNavbarVisible;

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
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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
    setIsDropdownOpen((current) => !current);
  };

  const displayName = user?.name || user?.email || 'My Account';
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

    if (user?.role === 'CUSTOMER') {
      setIsPrimePaymentOpen(true);
      return;
    }

    setIsSellModalOpen(true);
  };

  return (
    <>
      <header
        className={`sticky top-0 z-40 w-full bg-[#1A1A1A] text-white shadow-sm ${
          hasBlockingModalOpen
            ? 'translate-y-0'
            : `transition-transform duration-300 ease-out will-change-transform ${shouldShowNavbar ? 'translate-y-0' : '-translate-y-full'}`
        }`}
      >
        <div className="flex flex-col">
          <div className="flex w-full items-center justify-between border-b border-white/10 px-3 sm:px-4 md:px-6 py-3 md:py-4 relative">
            <div className="flex items-center">
              <button
                className="mr-2 sm:mr-3 xl:hidden text-gray-300 hover:text-white transition-colors"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label="Toggle mobile menu"
              >
                {isMobileMenuOpen ? <X size={20} className="sm:h-6 sm:w-6" /> : <Menu size={20} className="sm:h-6 sm:w-6" />}
              </button>
              <SiteBrand />
            </div>

            <nav className="hidden xl:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-7 text-[13px] font-semibold text-gray-300">
              <Link href="/" className="transition-colors hover:text-white">
                {t('navbar.home')}
              </Link>
              <Link href="/machines" className="transition-colors hover:text-white">
                {t('navbar.machines')}
              </Link>
              <button
                onClick={handleOpenSellVehicle}
                className="cursor-pointer outline-none transition-colors hover:text-white"
              >
                {t('navbar.sellVehicle')}
              </button>
              <Link href="/sold-vehicles" className="transition-colors hover:text-white">
                {t('navbar.soldVehicles')}
              </Link>
            </nav>

            <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
              <div className="hidden md:block">
                <LanguageSwitcher />
              </div>
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={handleToggleDropdown}
                  className="relative text-gray-300 transition-colors hover:text-white"
                  aria-label="Open notifications"
                >
                  <Bell className="h-5 w-5 sm:h-[20px] sm:w-[20px]" strokeWidth={2.5} />
                  {isAuthenticated && user?.role === 'CUSTOMER' && unreadCount > 0 ? (
                    <span className="absolute -right-2 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-jcb-yellow text-[10px] font-bold text-black">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  ) : null}
                </button>

                {isDropdownOpen ? (
                  <div className="fixed top-[60px] right-2 left-2 sm:absolute sm:top-auto sm:right-0 sm:left-auto z-50 mt-0 sm:mt-3 sm:w-80 overflow-hidden rounded-lg border border-gray-100 bg-white text-gray-800 shadow-xl">
                    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                      <h3 className="text-sm font-bold text-gray-900">{t('common.notifications')}</h3>
                      <div className="flex items-center gap-3">
                        {notifications.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => void markAllNotificationsAsRead()}
                            className="text-xs font-semibold text-[#9A7600] hover:text-[#7A5F00]"
                          >
                            {t('common.markAllRead')}
                          </button>
                        ) : null}
                        <Link
                          href="/machines"
                          onClick={() => setIsDropdownOpen(false)}
                          className="text-xs font-semibold text-blue-600 hover:underline"
                        >
                          {t('common.viewAll')}
                        </Link>
                      </div>
                    </div>
                    <div className="max-h-[350px] overflow-y-auto">
                      {!isAuthenticated || user?.role !== 'CUSTOMER' ? (
                        <div className="p-6 text-center text-sm text-gray-500">
                          <Package className="mx-auto mb-2 h-8 w-8 opacity-20" />
                          {t('common.loginToViewNotifications')}
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-500">
                          <Package className="mx-auto mb-2 h-8 w-8 opacity-20" />
                          {t('common.noNotifications')}
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <Link
                            href={notification.link || '/machines'}
                            key={notification.id}
                            onClick={() => {
                              void markNotificationAsRead(notification.id);
                              setIsDropdownOpen(false);
                            }}
                            className="flex items-start gap-3 border-b border-gray-50 bg-[#FFF9E6] p-3 transition-colors hover:bg-gray-50"
                          >
                            <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#FFF3CD] text-[#9A7600]">
                              <Package size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="line-clamp-1 text-xs font-bold text-gray-900">{notification.title}</p>
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-600">{notification.message}</p>
                              <p className="mt-1 text-[10px] text-gray-400">
                                {formatDateTime(notification.createdAt, locale)}
                              </p>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <Link href="/dealers" className="hidden md:flex rounded-[4px] bg-jcb-yellow px-6 py-2 text-sm font-bold text-black transition-colors hover:bg-yellow-400">
                {t('common.findDealer')}
              </Link>

              {isAuthenticated ? (
                <div className="relative ml-2" ref={profileDropdownRef}>
                  <button
                    onClick={() => setIsProfileDropdownOpen((current) => !current)}
                    className="flex items-center gap-2 rounded-full py-1.5 pl-2 pr-3 transition-colors hover:bg-white/5"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-700">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="hidden flex-col items-start sm:flex">
                      <span className="text-sm font-bold text-white">{displayName}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        {roleLabel}
                      </span>
                    </div>
                    <ChevronDown className="ml-1 h-4 w-4 text-gray-400" />
                  </button>

                  {isProfileDropdownOpen ? (
                    <div className="absolute right-0 z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-xl border border-gray-100 bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] transition-all duration-200 ease-out">
                      <div className="border-b border-gray-100 bg-white px-5 py-4">
                        <p className="truncate text-sm font-bold text-gray-900">{displayName}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{user?.email || 'customer@jcbexchange.com'}</p>
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
              ) : (
                <button
                  onClick={() => setAuthModalOpen(true)}
                  className="ml-0 sm:ml-2 flex items-center gap-1.5 sm:gap-2 rounded-[4px] border border-gray-600 px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 text-[10px] sm:text-xs md:text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  <User className="h-3 w-3 sm:h-4 sm:w-4" strokeWidth={2.5} />
                  <span className="hidden sm:inline">{t('common.loginSignup')}</span>
                  <span className="sm:hidden">{t('common.login')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Mobile Menu */}
          {isMobileMenuOpen && (
            <div className="xl:hidden w-full bg-[#1A1A1A] border-b border-white/10 px-4 py-4 flex flex-col gap-4">
              <div className="pb-1">
                <LanguageSwitcher />
              </div>
              <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="text-sm font-semibold text-gray-300 hover:text-white transition-colors">
                {t('navbar.home')}
              </Link>
              <Link href="/machines" onClick={() => setIsMobileMenuOpen(false)} className="text-sm font-semibold text-gray-300 hover:text-white transition-colors">
                {t('navbar.machines')}
              </Link>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleOpenSellVehicle();
                }}
                className="text-left text-sm font-semibold text-gray-300 hover:text-white transition-colors"
              >
                {t('navbar.sellVehicle')}
              </button>
              <Link href="/sold-vehicles" onClick={() => setIsMobileMenuOpen(false)} className="text-sm font-semibold text-gray-300 hover:text-white transition-colors">
                {t('navbar.soldVehicles')}
              </Link>
              <Link href="/dealers" onClick={() => setIsMobileMenuOpen(false)} className="text-sm font-semibold text-jcb-yellow hover:text-yellow-400 transition-colors">
                {t('common.findDealer')}
              </Link>
            </div>
          )}

        </div>
      </header>
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
