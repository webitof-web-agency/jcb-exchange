"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronDown, LogOut, Package, User, Menu, X, Home, Truck, PlusCircle, CheckCircle2, Store } from 'lucide-react';
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
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement>(null);
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

    if (user?.role === 'CUSTOMER' && !user?.isPrimeCustomer) {
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
                          href={notifications[0]?.link || '/machines'}
                          onClick={() => {
                            if (notifications[0]) {
                              void markNotificationAsRead(notifications[0].id);
                            }
                            setIsDropdownOpen(false);
                          }}
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
                            <div className="flex-1 min-w-0">
                              <p className="line-clamp-1 text-xs font-bold text-gray-900">{notification.title}</p>
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-600">{notification.message}</p>
                              <div className="mt-1 flex items-center justify-between">
                                <p className="text-[10px] text-gray-400">
                                  {formatDateTime(notification.createdAt, locale)}
                                </p>
                                <span className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-0.5">
                                  {t('common.viewAll')} &rarr;
                                </span>
                              </div>
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

        </div>
      </header>

      {/* Mobile Menu Backdrop Overlay */}
      {isMobileMenuOpen ? (
        <div
          className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-xs transition-opacity duration-300 xl:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      ) : null}

      {/* Mobile Slide-Over Navigation Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-[60] flex w-[290px] max-w-[85vw] flex-col bg-[#161616] text-white shadow-2xl transition-transform duration-300 ease-out xl:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="relative flex items-center justify-center border-b border-white/10 px-4 py-4 min-h-[60px]">
          <div className="flex items-center justify-center">
            <SiteBrand />
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* User Profile / Auth Card */}
        {isAuthenticated ? (
          <div className="mx-4 mt-4 flex items-center justify-between rounded-2xl bg-white/5 p-3.5 border border-white/10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFC107] font-bold text-black text-sm shadow-xs">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{displayName}</p>
                <p className="truncate text-[10px] font-bold text-[#FFC107] uppercase tracking-wider">{roleLabel}</p>
              </div>
            </div>
            {user?.role && PORTAL_ROLES.includes(user.role) ? (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handlePortalNavigation();
                }}
                className="rounded-lg bg-white/10 p-2 text-gray-300 hover:bg-white/20 hover:text-white transition-colors"
                title={portalMenuLabel}
              >
                <User size={16} />
              </button>
            ) : (
              <Link
                href={portalTarget}
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-lg bg-white/10 p-2 text-gray-300 hover:bg-white/20 hover:text-white transition-colors"
                title={portalMenuLabel}
              >
                <User size={16} />
              </Link>
            )}
          </div>
        ) : (
          <div className="mx-4 mt-4 p-3 rounded-2xl bg-white/5 border border-white/10">
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                setAuthModalOpen(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFC107] px-4 py-2.5 text-xs font-bold text-black shadow-xs transition hover:bg-[#FFB300]"
            >
              <User size={16} />
              {t('common.loginSignup')}
            </button>
          </div>
        )}

        {/* Navigation Links with Icons */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <Link
            href="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${
              pathname === '/' ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Home size={18} className={pathname === '/' ? 'text-[#FFC107]' : 'text-gray-400'} />
            <span>{t('navbar.home')}</span>
          </Link>

          <Link
            href="/machines"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${
              pathname === '/machines' ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Truck size={18} className={pathname === '/machines' ? 'text-[#FFC107]' : 'text-gray-400'} />
            <span>{t('navbar.machines')}</span>
          </Link>

          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              handleOpenSellVehicle();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-gray-300 transition-colors hover:bg-white/5 hover:text-white text-left"
          >
            <PlusCircle size={18} className="text-[#FFC107]" />
            <span>{t('navbar.sellVehicle')}</span>
          </button>

          <Link
            href="/sold-vehicles"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${
              pathname === '/sold-vehicles' ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <CheckCircle2 size={18} className={pathname === '/sold-vehicles' ? 'text-[#FFC107]' : 'text-gray-400'} />
            <span>{t('navbar.soldVehicles')}</span>
          </Link>

          <Link
            href="/dealers"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${
              pathname === '/dealers' ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Store size={18} className={pathname === '/dealers' ? 'text-[#FFC107]' : 'text-gray-400'} />
            <span>{t('common.findDealer')}</span>
          </Link>
        </nav>

        {/* Drawer Footer */}
        <div className="border-t border-white/10 p-4 space-y-3 bg-[#111]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">{t('common.language')}</span>
            <LanguageSwitcher direction="up" />
          </div>
          {isAuthenticated && (
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                logout();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <LogOut size={15} />
              {t('common.logoutSecurely')}
            </button>
          )}
        </div>
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
