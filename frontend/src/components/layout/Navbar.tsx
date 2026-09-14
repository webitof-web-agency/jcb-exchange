"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, ChevronDown, LogOut, Package, User, Menu, X, Home, Truck, PlusCircle, CheckCircle2, Store, ChevronRight, Tag, Smartphone } from 'lucide-react';
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
  const [playStoreLink, setPlayStoreLink] = useState<string | null>(null);
  const [appStoreLink, setAppStoreLink] = useState<string | null>(null);
  const [isWebView, setIsWebView] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
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
    if (typeof window !== 'undefined') {
      setIsWebView(!!(window as any).ReactNativeWebView);
    }

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
    if (window.innerWidth < 768) {
      if (!isAuthenticated) {
        setAuthModalOpen(true);
      } else {
        router.push('/notifications');
      }
    } else {
      setIsDropdownOpen((current) => !current);
    }
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
        className={`fixed top-0 left-0 right-0 z-40 w-full bg-[#1A1A1A] text-white shadow-sm lg:sticky lg:left-auto lg:right-auto ${hasBlockingModalOpen
            ? 'translate-y-0'
            : `transition-transform duration-300 ease-out will-change-transform ${shouldShowNavbar ? 'translate-y-0' : 'translate-y-0 xl:-translate-y-full'}`
          }`}
      >
        <div className="flex flex-col">
          <div className="flex w-full items-center justify-between border-b border-white/10 px-3 sm:px-4 md:px-6 py-3 md:py-4 relative">
            <div className="flex items-center flex-1 xl:flex-none">
              <button
                className="mr-2 sm:mr-3 xl:hidden text-gray-300 hover:text-white transition-colors"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label="Toggle mobile menu"
              >
                {isMobileMenuOpen ? <X size={20} className="sm:h-6 sm:w-6" /> : <Menu size={20} className="sm:h-6 sm:w-6" />}
              </button>
              <div className="hidden xl:block">
                <SiteBrand />
              </div>
            </div>

            {/* Mobile Centered Logo */}
            <div className="xl:hidden absolute left-1/2 top-1/2 w-[70px] -translate-x-1/2 -translate-y-1/2">
              <SiteBrand align="center" />
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
                  className="relative flex items-center justify-center p-1 md:p-0 text-gray-300 transition-colors hover:text-white"
                  aria-label="Open notifications"
                >
                  <Bell className="h-[20px] w-[20px] md:h-[20px] md:w-[20px]" strokeWidth={2.5} />
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
                    <ChevronDown className="hidden md:block ml-1 h-4 w-4 text-gray-400" />
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
                  className="ml-1 md:ml-2 flex items-center justify-center gap-2 md:rounded-[4px] md:border md:border-gray-600 md:px-4 p-1 md:py-2 text-sm font-semibold text-gray-300 md:text-white transition-colors hover:text-white md:hover:bg-white/10"
                >
                  <User className="h-[20px] w-[20px] md:h-4 md:w-4" strokeWidth={2.5} />
                  <span className="hidden md:inline">{t('common.loginSignup')}</span>
                </button>
              )}
            </div>
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
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${pathname === '/machines' ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'
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

          {isAuthenticated ? (
            <Link
              href="/notifications"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${pathname === '/notifications' ? 'bg-[#FFC107]/15 text-[#FFC107]' : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
            >
              <Bell size={18} className={pathname === '/notifications' ? 'text-[#FFC107]' : 'text-gray-400'} />
              <span>{t('common.notifications', 'Notifications')}</span>
            </Link>
          ) : (
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                setAuthModalOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-gray-300 transition-colors hover:bg-white/5 hover:text-white text-left"
            >
              <Bell size={18} className="text-gray-400" />
              <span>{t('common.notifications', 'Notifications')}</span>
            </button>
          )}

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
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M3 20.5V3.5C3 2.91 3.34 2.39 3.84 2.15L13.69 12L3.84 21.85C3.34 21.61 3 21.09 3 20.5ZM4.53 2.76L14.6 12.83L19.46 10.4C20.19 10 20.19 8.94 19.46 8.54L4.53 2.76ZM20.44 11.26L15.67 13.65L14.47 12.45L20.44 11.26ZM15.67 10.35L19.46 11.83C20.48 12.23 20.48 13.72 19.46 14.12L15.67 15.6L14.47 14.4L15.67 10.35ZM4.53 21.24L14.6 11.17L15.67 12.24L4.53 21.24Z" fill="url(#paint0_linear_141_340)" />
                  <defs>
                    <linearGradient id="paint0_linear_141_340" x1="18.9141" y1="2.78125" x2="6.60156" y2="21.1406" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#00A0FF" />
                      <stop offset="0.0066" stopColor="#00A1FF" />
                      <stop offset="0.2601" stopColor="#00BEFF" />
                      <stop offset="0.5122" stopColor="#00D2FF" />
                      <stop offset="0.7604" stopColor="#00DFFF" />
                      <stop offset="1" stopColor="#00E3FF" />
                    </linearGradient>
                  </defs>
                </svg>
                {t('common.downloadForAndroid', 'Download for Android')}
              </a>

              <a
                href={appStoreLink || 'https://apps.apple.com/app'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2.5 rounded-xl bg-[#0f172a] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M16.365 14.402C16.388 11.391 18.825 9.946 18.938 9.876C17.489 7.76 15.195 7.42 14.417 7.375C12.474 7.18 10.584 8.52 9.588 8.52C8.591 8.52 7.042 7.399 5.437 7.414C3.393 7.444 1.503 8.604 0.457 10.428C-1.666 14.116 0.283 19.569 2.35 22.564C3.363 24.032 4.568 25.688 6.136 25.613C7.659 25.538 8.243 24.619 10.089 24.619C11.935 24.619 12.474 25.613 14.043 25.583C15.657 25.553 16.697 24.093 17.693 22.624C18.857 20.912 19.336 19.245 19.359 19.155C19.314 19.14 16.342 18.016 16.365 14.402ZM12.723 4.887C13.565 3.869 14.135 2.449 13.981 1.029C12.756 1.079 11.238 1.849 10.372 2.852C9.594 3.739 8.922 5.187 9.106 6.574C10.472 6.679 11.881 5.901 12.723 4.887Z" />
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
