'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import api from '@/lib/api';
import AccountAccessInactive from '@/components/auth/AccountAccessInactive';
import AccountAccessRevoked from '@/components/auth/AccountAccessRevoked';
import PortalBrand from '@/components/layout/PortalBrand';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useTranslation } from '@/hooks/useTranslation';
import { isInactiveAccessError, isRevokedAccessError } from '@/lib/sessionAccess';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { LogOut, User as UserIcon, Settings, LayoutDashboard, ShieldCheck, List, Users, ChevronDown, Tags, UsersRound, Repeat, MessagesSquare, Truck, BadgeIndianRupee, Menu, X as XIcon, Languages } from 'lucide-react';
import {
  employeeBrandsPermissions,
  employeeRolesPermissions,
  employeeUsersPermissions,
  getEmployeeLandingPath,
  resolveEmployeeRouteRedirect,
} from '@/lib/portalRoutes';
import { hasAnyPermission } from '@/lib/permissionUtils';

const navItems = [
  { href: '/superadmin/dashboard', labelKey: 'admin.dashboard', icon: LayoutDashboard },
  { href: '/superadmin/enquiries', labelKey: 'admin.enquiries', icon: MessagesSquare },
  { href: '/superadmin/listings', labelKey: 'admin.listings', icon: Truck },
  { href: '/superadmin/partners', labelKey: 'admin.partners', icon: List },
  { href: '/superadmin/visitors', labelKey: 'admin.visitors', icon: UsersRound },
  { href: '/superadmin/categories', labelKey: 'admin.categories', icon: Tags },
  { href: '/superadmin/brands', labelKey: 'admin.brands', icon: BadgeIndianRupee },
  { href: '/superadmin/verifications', labelKey: 'admin.verifications', icon: ShieldCheck },
  { href: '/superadmin/recurrence', labelKey: 'admin.recurrence', icon: Repeat },
  { href: '/superadmin/translations', labelKey: 'admin.translationManager', icon: Languages },
];

const adminNavItems = [
  { href: '/admin/dashboard', labelKey: 'admin.dashboard', icon: LayoutDashboard },
];

const employeeModuleNavItems = [
  { href: '/employee/dashboard', labelKey: 'admin.dashboard', icon: LayoutDashboard, permissions: ['dashboard.view'] },
  { href: '/employee/enquiries', labelKey: 'admin.enquiries', icon: MessagesSquare, permissions: ['enquiries.manage'] },
  { href: '/employee/listings', labelKey: 'admin.listings', icon: Truck, permissions: ['listings.read'] },
  { href: '/employee/partners', labelKey: 'admin.partners', icon: List, permissions: ['partners.read'] },
  { href: '/employee/visitors', labelKey: 'admin.visitors', icon: UsersRound, permissions: ['visitors.read'] },
  { href: '/employee/categories', labelKey: 'admin.categories', icon: Tags, permissions: ['categories.read'] },
  { href: '/employee/brands', labelKey: 'admin.brands', icon: BadgeIndianRupee, permissions: ['brands.read'] },
  { href: '/employee/verifications', labelKey: 'admin.verifications', icon: ShieldCheck, permissions: ['kyc.manage'] },
  { href: '/employee/recurrence', labelKey: 'admin.recurrence', icon: Repeat, permissions: ['recurrence.manage'] },
  { href: '/employee/translations', labelKey: 'admin.translationManager', icon: Languages, permissions: ['translations.manage'] },
  { href: '/employee/settings', labelKey: 'common.settings', icon: Settings, permissions: ['settings.manage'] },
];

const getRequiredPermissionsForPath = (pathname: string) => {
  if (pathname === '/employee/users/roles' || pathname === '/superadmin/users/roles') {
    return employeeRolesPermissions;
  }

  if (pathname === '/employee/users' || pathname === '/superadmin/users') {
    return employeeUsersPermissions;
  }

  if (pathname === '/employee/brands' || pathname === '/superadmin/brands') {
    return employeeBrandsPermissions;
  }

  const matchedModule = employeeModuleNavItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return matchedModule?.permissions || null;
};

const formatPortalLabel = (value?: string | null) =>
  value
    ? value
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : null;

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { customHeader } = useHeaderStore();
  const { isAuthenticated, user, logout, hasHydrated, hydrateAuth, updateUser } = useAuthStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUsersMenuExpanded, setIsUsersMenuExpanded] = useState(false);
  const [isAccessRevoked, setIsAccessRevoked] = useState(false);
  const [isAccessInactive, setIsAccessInactive] = useState(false);
  const [isSessionChecking, setIsSessionChecking] = useState(true);
  const [badges, setBadges] = useState<{
    enquiries: number;
    verifications: number;
    visitors: number;
    recurrence: number;
    listingsPendingApproval: number;
    clearedEnquiries: number;
    clearedVisitors: number;
    clearedRecurrence: number;
  }>({
    enquiries: 0,
    verifications: 0,
    visitors: 0,
    recurrence: 0,
    listingsPendingApproval: 0,
    clearedEnquiries: 0,
    clearedVisitors: 0,
    clearedRecurrence: 0,
  });
  const hasCompletedInitialSessionCheck = useRef(false);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'EMPLOYEE';
  const isEmployee = user?.role === 'EMPLOYEE';
  const userPermissions = useMemo(() => user?.permissions || [], [user?.permissions]);
  const userPermissionKey = userPermissions.join('|');
  const employeeHomeHref = useMemo(() => getEmployeeLandingPath(userPermissions), [userPermissions]);
  const employeeNavItems = useMemo(
    () =>
      employeeModuleNavItems.filter(
        (item) => hasAnyPermission(userPermissions, item.permissions)
      ),
    [userPermissions]
  );
  const employeeCanSeeUsers = hasAnyPermission(userPermissions, employeeUsersPermissions);
  const employeeCanSeeRoles = hasAnyPermission(userPermissions, employeeRolesPermissions);
  const employeeHasAnyVisibleRoute = employeeNavItems.length > 0 || employeeCanSeeUsers || employeeCanSeeRoles;

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

    if (!isAuthenticated || (!isSuperAdmin && !isAdmin)) {
      router.replace('/login');
      return;
    }

    if (isEmployee) {
      const employeeRedirect = pathname.startsWith('/superadmin')
        ? resolveEmployeeRouteRedirect(pathname, userPermissions)
        : null;

      if (employeeRedirect && employeeRedirect !== pathname) {
        router.replace(employeeRedirect);
        return;
      }

      if (pathname === '/admin/dashboard') {
        router.replace(employeeHomeHref);
        return;
      }

      const requiredPermissions = getRequiredPermissionsForPath(pathname);

      if (pathname === '/employee/dashboard' && !hasAnyPermission(userPermissions, ['dashboard.view'])) {
        if (!employeeHasAnyVisibleRoute) {
          logout();
          router.replace('/login');
          return;
        }

        router.replace(employeeHomeHref);
        return;
      }

      if (requiredPermissions && !hasAnyPermission(userPermissions, requiredPermissions)) {
        if (!employeeHasAnyVisibleRoute) {
          logout();
          router.replace('/login');
          return;
        }

        router.replace(employeeHomeHref);
      }
      return;
    }

    if (isAdmin && pathname.startsWith('/superadmin')) {
      router.replace('/admin/dashboard');
      return;
    }

    if (isAdmin && !isEmployee && pathname === '/employee/dashboard') {
      router.replace('/admin/dashboard');
      return;
    }

    if (isAdmin && !isEmployee && pathname.startsWith('/employee')) {
      router.replace('/admin/dashboard');
      return;
    }

    if (isSuperAdmin && pathname === '/admin/dashboard') {
      router.replace('/superadmin/dashboard');
    }
  }, [employeeCanSeeRoles, employeeCanSeeUsers, employeeHasAnyVisibleRoute, employeeHomeHref, hasHydrated, isAccessInactive, isAccessRevoked, isAdmin, isAuthenticated, isEmployee, isSuperAdmin, pathname, router, user, userPermissionKey, userPermissions, logout]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(user?.role || '')) {
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

        if (!['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(response.data.user?.role || '')) {
          logout();
          router.replace('/login');
          return;
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
  }, [hasHydrated, isAuthenticated, logout, router, updateUser, user?.role]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || (!isSuperAdmin && !isAdmin)) return;

    let isMounted = true;
    const fetchBadges = async () => {
      try {
        const response = await api.get('/superadmin/badges');
        if (isMounted && response.data?.badges) {
          const backendBadges = response.data.badges;
          const backendEnquiries = backendBadges.enquiries || 0;
          const backendVisitors = backendBadges.visitors || 0;
          const backendRecurrence = backendBadges.recurrence || 0;
          
          let currentClearedEnquiries = parseInt(localStorage.getItem(`cleared_enquiries_${user?.id}`) || '0');
          let currentClearedVisitors = parseInt(localStorage.getItem(`cleared_visitors_${user?.id}`) || '0');
          let currentClearedRecurrence = parseInt(localStorage.getItem(`cleared_recurrence_${user?.id}`) || '0');

          if (backendEnquiries < currentClearedEnquiries) {
            currentClearedEnquiries = backendEnquiries;
            localStorage.setItem(`cleared_enquiries_${user?.id}`, currentClearedEnquiries.toString());
          }

          if (backendVisitors < currentClearedVisitors) {
            currentClearedVisitors = backendVisitors;
            localStorage.setItem(`cleared_visitors_${user?.id}`, currentClearedVisitors.toString());
          }

          if (backendRecurrence < currentClearedRecurrence) {
            currentClearedRecurrence = backendRecurrence;
            localStorage.setItem(`cleared_recurrence_${user?.id}`, currentClearedRecurrence.toString());
          }

          if ((pathname.startsWith('/superadmin/enquiries') || pathname.startsWith('/employee/enquiries')) && backendEnquiries > currentClearedEnquiries) {
            currentClearedEnquiries = backendEnquiries;
            localStorage.setItem(`cleared_enquiries_${user?.id}`, currentClearedEnquiries.toString());
          }

          if ((pathname.startsWith('/superadmin/visitors') || pathname.startsWith('/employee/visitors')) && backendVisitors > currentClearedVisitors) {
            currentClearedVisitors = backendVisitors;
            localStorage.setItem(`cleared_visitors_${user?.id}`, currentClearedVisitors.toString());
          }

          if ((pathname.startsWith('/superadmin/recurrence') || pathname.startsWith('/employee/recurrence')) && backendRecurrence > currentClearedRecurrence) {
            currentClearedRecurrence = backendRecurrence;
            localStorage.setItem(`cleared_recurrence_${user?.id}`, currentClearedRecurrence.toString());
          }

          setBadges({
            enquiries: backendBadges.enquiries || 0,
            verifications: backendBadges.verifications || 0,
            visitors: backendVisitors,
            recurrence: backendRecurrence,
            listingsPendingApproval: backendBadges.listingsPendingApproval || 0,
            clearedEnquiries: currentClearedEnquiries,
            clearedVisitors: currentClearedVisitors,
            clearedRecurrence: currentClearedRecurrence,
          });
        }
      } catch {
        // Silently fail, it's just badges
      }
    };

    fetchBadges();
    const intervalId = window.setInterval(fetchBadges, 60000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [hasHydrated, isAuthenticated, isSuperAdmin, isAdmin, pathname, user?.id]);

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">
          {t('admin.loadingPortalSession')}
        </div>
      </div>
    );
  }

  if (isAccessRevoked) {
    return (
      <AccountAccessRevoked
        accountLabel={t('admin.adminPortalAccount')}
        onRetry={() => router.replace('/login')}
      />
    );
  }

  if (isAccessInactive) {
    return (
      <AccountAccessInactive
        accountLabel={t('admin.adminPortalAccount')}
        onRetry={() => router.replace('/login')}
      />
    );
  }

  if (!isAuthenticated || (!isSuperAdmin && !isAdmin)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">
          {t('admin.checkingPortalAccess')}
        </div>
      </div>
    );
  }

  if (isSessionChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">
          {t('admin.verifyingPortalSession')}
        </div>
      </div>
    );
  }

  const visibleNavItems = isSuperAdmin ? navItems : isEmployee ? employeeNavItems : adminNavItems;
  const portalTitle = isSuperAdmin ? t('admin.superAdminPortalTitle') : isEmployee ? t('admin.employeePortalTitle') : t('admin.portalTitle');
  const displayName = user.name || (isSuperAdmin ? t('admin.superAdminPortalTitle') : isEmployee ? t('admin.employeePortalTitle') : t('admin.portalTitle'));
  const translatedRoleLabel =
    user?.role === 'SUPER_ADMIN'
      ? t('common.superAdmin')
      : user?.role === 'ADMIN'
        ? t('common.admin')
        : user?.role === 'EMPLOYEE'
          ? t('common.employee')
          : formatPortalLabel(user?.role) || t('common.notAvailable');
  const pageTitleMap: Record<string, string> = {
    '/superadmin/dashboard': t('admin.superAdminDashboard'),
    '/superadmin/verifications': t('admin.partnerVerifications'),
    '/superadmin/partners': t('admin.partnerDirectory'),
    '/superadmin/leads': t('admin.visitors'),
    '/superadmin/enquiries': t('admin.enquiryManagement'),
    '/superadmin/visitors': t('admin.visitors'),
    '/superadmin/recurrence': t('admin.recurrence'),
    '/superadmin/categories': t('admin.categoryManagement'),
    '/superadmin/brands': t('admin.brandManagement'),
    '/superadmin/users': t('admin.userManagement'),
    '/superadmin/users/roles': t('common.usersRole'),
    '/superadmin/listings': t('admin.platformListings'),
    '/superadmin/profile': t('admin.myProfilePage'),
    '/superadmin/settings': t('admin.platformSettings'),
    '/superadmin/translations': t('admin.translationManager'),
    '/admin/dashboard': isEmployee ? t('admin.employeeDashboard') : t('admin.adminDashboard'),
    '/admin/profile': t('admin.myProfilePage'),
    '/employee/dashboard': t('admin.employeeDashboard'),
    '/employee/enquiries': t('admin.enquiryManagement'),
    '/employee/verifications': t('admin.partnerVerifications'),
    '/employee/partners': t('admin.partnerDirectory'),
    '/employee/visitors': t('admin.visitors'),
    '/employee/categories': t('admin.categoryManagement'),
    '/employee/brands': t('admin.brandManagement'),
    '/employee/recurrence': t('admin.recurrence'),
    '/employee/users': t('admin.userManagement'),
    '/employee/users/roles': t('common.usersRole'),
    '/employee/listings': t('admin.platformListings'),
    '/employee/profile': t('admin.myProfilePage'),
    '/employee/settings': t('admin.platformSettings'),
    '/employee/translations': t('admin.translationManager'),
  };
  const getPageTitle = () => {
    if (pageTitleMap[pathname]) return pageTitleMap[pathname];
    if (pathname.startsWith('/superadmin/enquiries/') || pathname.startsWith('/employee/enquiries/')) return t('admin.enquiryDetails');
    if (pathname.startsWith('/superadmin/partners/') || pathname.startsWith('/employee/partners/')) {
      if (pathname.endsWith('/edit')) return t('admin.editPartnerProfile');
      if (pathname.endsWith('/deposit')) return t('admin.partnerDeposit');
      return t('admin.partnerDetails');
    }
    if (pathname.startsWith('/superadmin/verifications/') || pathname.startsWith('/employee/verifications/')) return t('admin.verificationDetails');
    return isSuperAdmin ? t('admin.superAdminDashboard') : isEmployee ? t('admin.employeeDashboard') : t('admin.adminDashboard');
  };
  const pageTitle = getPageTitle();
  const profileHref = isSuperAdmin ? '/superadmin/profile' : isEmployee ? '/employee/profile' : '/admin/profile';
  const settingsHref = isSuperAdmin ? '/superadmin/settings' : isEmployee ? '/employee/settings' : '/admin/profile';
  const isUsersSectionActive = pathname.startsWith('/superadmin/users') || pathname.startsWith('/employee/users');
  const isUsersDropdownExpanded = isUsersSectionActive || isUsersMenuExpanded;
  const usersListHref = isEmployee ? '/employee/users' : '/superadmin/users';
  const rolesListHref = isEmployee ? '/employee/users/roles' : '/superadmin/users/roles';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#1A1A1A] text-white flex flex-col shrink-0 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 sm:p-6 border-b border-white/10">
          <div>
            <PortalBrand href={isSuperAdmin ? '/superadmin/dashboard' : isEmployee ? employeeHomeHref : '/admin/dashboard'} subtitle={portalTitle} />
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-colors z-10"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            let badgeCount = 0;
            if (item.href.includes('enquiries')) {
              badgeCount = Math.max(0, (badges.enquiries || 0) - (badges.clearedEnquiries || 0));
            }
            else if (item.href.includes('listings')) badgeCount = badges.listingsPendingApproval || 0;
            else if (item.href.includes('verifications')) badgeCount = pathname.startsWith(item.href) ? 0 : badges.verifications;
            else if (item.href.includes('visitors')) badgeCount = Math.max(0, (badges.visitors || 0) - (badges.clearedVisitors || 0));
            else if (item.href.includes('recurrence')) badgeCount = Math.max(0, (badges.recurrence || 0) - (badges.clearedRecurrence || 0));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center justify-between px-4 py-2.5 rounded-lg transition-all duration-200 ${isActive
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
                  <span>{t(item.labelKey)}</span>
                </div>
                {badgeCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </Link>
            );
          })}

          {isSuperAdmin || (isEmployee && (employeeCanSeeUsers || employeeCanSeeRoles)) ? (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setIsUsersMenuExpanded((current) => !current)}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left transition-all duration-200 ${
                  isUsersSectionActive
                    ? 'border-[#FFC107] bg-[#FFC107]/5 font-semibold text-white'
                    : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Users className={`h-5 w-5 ${isUsersSectionActive ? 'text-[#FFC107]' : ''}`} />
                  <span>{t('admin.users')}</span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${isUsersDropdownExpanded ? 'rotate-180' : ''} ${
                    isUsersSectionActive ? 'text-[#FFC107]' : 'text-gray-500'
                  }`}
                />
              </button>

              {isUsersDropdownExpanded ? (
                <div className="ml-4 space-y-1 border-l border-white/10 pl-3">
                  {isSuperAdmin || employeeCanSeeUsers ? (
                    <Link
                      href={usersListHref}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-4 py-2 text-sm transition-all duration-200 ${
                        pathname === usersListHref
                          ? 'bg-[#FFC107]/10 font-semibold text-white'
                          : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      <span>{t('common.allUsers')}</span>
                    </Link>
                  ) : null}
                  {isSuperAdmin || employeeCanSeeRoles ? (
                    <Link
                      href={rolesListHref}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-4 py-2 text-sm transition-all duration-200 ${
                        pathname === rolesListHref
                          ? 'bg-[#FFC107]/10 font-semibold text-white'
                          : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      <span>{t('common.usersRole')}</span>
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </nav>
        <div className="p-4 border-t border-white/10 shrink-0">
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
              <Menu className="w-6 h-6 sm:w-6 sm:h-6" />
            </button>
            {customHeader || <h1 className="font-bold text-[17px] sm:text-xl text-gray-900 truncate">{pageTitle}</h1>}
          </div>
          <div className="ml-2 flex items-center gap-3 shrink-0">
            <LanguageSwitcher />

            {/* Profile Dropdown Container */}
            <div className="relative shrink-0">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 sm:gap-3 focus:outline-none hover:bg-gray-50 p-1 sm:p-1.5 sm:pr-3 rounded-full transition-colors border border-transparent hover:border-gray-200"
              >
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-gray-900">{displayName}</p>
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{translatedRoleLabel}</span>
                </div>
                <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-700">
                  {(user.name || user.email || 'A').charAt(0).toUpperCase()}
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <>
                  {/* Transparent overlay to detect outside clicks */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsDropdownOpen(false)}
                  />

                  <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] z-50 overflow-hidden transform origin-top-right transition-all duration-200 ease-out">
                    <div className="px-5 py-4 border-b border-gray-100 bg-white">
                      <p className="text-sm font-bold text-gray-900 truncate">{displayName}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{user.email || t('common.adminEmailFallback')}</p>
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
                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          router.push(settingsHref);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-colors group"
                      >
                        <Settings className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                        <span>{t('common.settings')}</span>
                      </button>
                      <div className="h-px bg-gray-100 my-1.5 mx-2"></div>
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
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">{children}</div>
      </main>
    </div>
  );
}
