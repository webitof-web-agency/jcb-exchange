'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import api from '@/lib/api';
import AccountAccessInactive from '@/components/auth/AccountAccessInactive';
import AccountAccessRevoked from '@/components/auth/AccountAccessRevoked';
import PortalBrand from '@/components/layout/PortalBrand';
import BrandLoader from '@/components/ui/BrandLoader';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useTranslation } from '@/hooks/useTranslation';
import { useIdleAutoLogout } from '@/hooks/useIdleAutoLogout';
import { accountsNavItems } from '@/lib/accountsPermissions';
import { isDefinitiveSessionFailure, isInactiveAccessError, isRevokedAccessError } from '@/lib/sessionAccess';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { isFinanceTransactionDetailPath } from '@/lib/adminPageTitles';
import { FINANCE_WORKSPACE_VIEW_PERMISSIONS } from '@/lib/financeWorkspace';
import { Bell, ExternalLink, LogOut, User as UserIcon, Settings, LayoutDashboard, ShieldCheck, List, Users, ChevronDown, ChevronRight, Tags, UsersRound, Repeat, MessagesSquare, Truck, CarFront, BadgeIndianRupee, Menu, X as XIcon, Languages, PanelsTopLeft, Briefcase, BarChart3, WalletCards, BookOpen, ScanLine, FileText, HandCoins, ClipboardCheck, ReceiptText, ListTodo } from 'lucide-react';
import { MessageCircle, Smartphone } from 'lucide-react';
import { useApiBillingSummary } from '@/hooks/useApiBillingSummary';
import { ApiWalletHeader } from '@/components/apiBilling/ApiBillingDisplay';
import {
  employeeBrandsPermissions,
  employeeBlogPermissions,
  employeeFooterPermissions,
  employeePartnerAgreementPermissions,
  employeeRolesPermissions,
  employeeUsersPermissions,
  employeeWhatsAppPermissions,
  employeeSmsPermissions,
  getEmployeeLandingPath,
  resolveEmployeeRouteRedirect,
} from '@/lib/portalRoutes';
import { hasAnyPermission } from '@/lib/permissionUtils';
import {
  IDENTITY_HUB_VIEW_PERMISSIONS,
  VEHICLE_TRANSPORT_VIEW_PERMISSIONS,
  PAN_VIEW_PERMISSIONS,
  GST_VIEW_PERMISSIONS,
  DRIVING_LICENSE_VIEW_PERMISSIONS,
} from '@/lib/featurePermissions';
import PushNotificationManager from '@/components/shared/PushNotificationManager';
import { UserAvatar } from '@/components/profile/AvatarUpload';

const navItems = [
  { href: '/superadmin/dashboard', labelKey: 'admin.dashboard', icon: LayoutDashboard },
  { href: '/superadmin/verifications', labelKey: 'admin.verifications', icon: ShieldCheck },
  { href: '/superadmin/identity-hub', labelKey: 'admin.identityHub', icon: ScanLine },
  { href: '/superadmin/vehicle-transport', labelKey: 'admin.vehicleTransport', icon: CarFront },
  { href: '/superadmin/enquiries', labelKey: 'admin.enquiries', icon: MessagesSquare },
  { href: '/superadmin/listings', labelKey: 'admin.listings', icon: Truck },
  { href: '/superadmin/invoices', labelKey: 'admin.invoices', defaultLabel: 'Invoices', icon: ReceiptText },
  { href: '/superadmin/tasks', labelKey: 'admin.tasks', defaultLabel: 'Tasks', icon: ListTodo },
  { href: '/superadmin/partners', labelKey: 'admin.partners', icon: List },
  { href: '/superadmin/visitors', labelKey: 'admin.visitors', icon: UsersRound },
  { href: '/superadmin/whatsapp', labelKey: 'enquiryDetails.whatsapp', icon: MessageCircle },
  { href: '/superadmin/sms', labelKey: 'admin.smsNotifications', icon: Smartphone },
  { href: '/superadmin/categories', labelKey: 'admin.categories', icon: Tags },
  { href: '/superadmin/brands', labelKey: 'admin.brands', icon: BadgeIndianRupee },
  { href: '/superadmin/recurrence', labelKey: 'admin.recurrence', icon: Repeat },
  { href: '/superadmin/analytics', labelKey: 'admin.analytics', icon: BarChart3 },
  { href: '/superadmin/finance/workspace', labelKey: 'admin.financeWorkspace', defaultLabel: 'Financial Reports & CA Workspace', icon: BookOpen },
  { href: '/superadmin/finance/expenses', labelKey: 'admin.expenses', icon: WalletCards },
  { href: '/superadmin/footer', labelKey: 'admin.footerContent', icon: PanelsTopLeft },
  { href: '/superadmin/partner-agreements', labelKey: 'admin.partnerAgreements', icon: FileText },
  { href: '/superadmin/blogs', labelKey: 'admin.blog', icon: BookOpen },
  { href: '/superadmin/translations', labelKey: 'admin.translationManager', icon: Languages },
];

const adminNavItems = [
  { href: '/admin/dashboard', labelKey: 'admin.dashboard', icon: LayoutDashboard },
  { href: '/admin/identity-hub', labelKey: 'admin.identityHub', icon: ScanLine, permissions: IDENTITY_HUB_VIEW_PERMISSIONS },
  { href: '/admin/vehicle-transport', labelKey: 'admin.vehicleTransport', icon: CarFront, permissions: VEHICLE_TRANSPORT_VIEW_PERMISSIONS },
  { href: '/admin/analytics', labelKey: 'admin.analytics', icon: BarChart3 },
  { href: '/admin/finance/workspace', labelKey: 'admin.financeWorkspace', defaultLabel: 'Financial Reports & CA Workspace', icon: BookOpen },
  { href: '/admin/finance/expenses', labelKey: 'admin.expenses', icon: WalletCards },
  { href: '/admin/invoices', labelKey: 'admin.invoices', defaultLabel: 'Invoices', icon: ReceiptText },
  { href: '/admin/tasks', labelKey: 'admin.tasks', defaultLabel: 'Tasks', icon: ListTodo },
];

const employeeModuleNavItems = [
  { href: '/employee/dashboard', labelKey: 'admin.dashboard', icon: LayoutDashboard, permissions: ['dashboard.view'] },
  { href: '/employee/verifications', labelKey: 'admin.verifications', icon: ShieldCheck, permissions: ['kyc.manage', 'kyc.edit.override'] },
  { href: '/employee/identity-hub', labelKey: 'admin.identityHub', icon: ScanLine, permissions: IDENTITY_HUB_VIEW_PERMISSIONS },
  { href: '/employee/vehicle-transport', labelKey: 'admin.vehicleTransport', icon: CarFront, permissions: VEHICLE_TRANSPORT_VIEW_PERMISSIONS },
  { href: '/employee/enquiries', labelKey: 'admin.enquiries', icon: MessagesSquare, permissions: ['enquiries.manage'] },
  { href: '/employee/listings', labelKey: 'admin.listings', icon: Truck, permissions: ['listings.read'] },
  { href: '/employee/partners', labelKey: 'admin.partners', icon: List, permissions: ['partners.read'] },
  { href: '/employee/visitors', labelKey: 'admin.visitors', icon: UsersRound, permissions: ['visitors.read'] },
  { href: '/employee/whatsapp', labelKey: 'enquiryDetails.whatsapp', icon: MessageCircle, permissions: employeeWhatsAppPermissions },
  { href: '/employee/sms', labelKey: 'admin.smsNotifications', icon: Smartphone, permissions: employeeSmsPermissions },
  { href: '/employee/categories', labelKey: 'admin.categories', icon: Tags, permissions: ['categories.read'] },
  { href: '/employee/brands', labelKey: 'admin.brands', icon: BadgeIndianRupee, permissions: ['brands.read'] },
  { href: '/employee/recurrence', labelKey: 'admin.recurrence', icon: Repeat, permissions: ['recurrence.manage'] },
  { href: '/employee/analytics', labelKey: 'admin.analytics', icon: BarChart3, permissions: ['analytics.read'] },
  { href: '/employee/finance/workspace', labelKey: 'admin.financeWorkspace', defaultLabel: 'Financial Reports & CA Workspace', icon: BookOpen, permissions: FINANCE_WORKSPACE_VIEW_PERMISSIONS },
  { href: '/employee/finance/expenses', labelKey: 'admin.expenses', icon: WalletCards, permissions: ['finance.read', 'finance.manage'] },
  { href: '/employee/invoices', labelKey: 'admin.invoices', defaultLabel: 'Invoices', icon: ReceiptText, permissions: ['accounts.sell.read', 'accounts.sell.crud'] },
  { href: '/employee/tasks', labelKey: 'admin.tasks', defaultLabel: 'Tasks', icon: ListTodo, permissions: ['accounts.rto.read', 'accounts.rto.crud'] },
  { href: '/employee/footer', labelKey: 'admin.footerContent', icon: PanelsTopLeft, permissions: employeeFooterPermissions },
  { href: '/employee/partner-agreements', labelKey: 'admin.partnerAgreements', icon: FileText, permissions: employeePartnerAgreementPermissions },
  { href: '/employee/blogs', labelKey: 'admin.blog', icon: BookOpen, permissions: employeeBlogPermissions },
  { href: '/employee/translations', labelKey: 'admin.translationManager', icon: Languages, permissions: ['translations.manage'] },
  { href: '/employee/settings', labelKey: 'common.settings', icon: Settings, permissions: ['settings.manage'] },
];

const recruitmentNavItems = [
  { key: 'dashboard', labelKey: 'admin.recruitmentDashboard', defaultLabel: 'Dashboard', permissions: ['recruitment.dashboard.read'] },
  { key: 'jobs', labelKey: 'admin.recruitmentJobs', defaultLabel: 'Jobs', permissions: ['recruitment.jobs.read'] },
  { key: 'applications', labelKey: 'admin.recruitmentApplications', defaultLabel: 'Applications', permissions: ['recruitment.applications.read'] },
  { key: 'interviews', labelKey: 'admin.recruitmentInterviews', defaultLabel: 'Interviews', permissions: ['recruitment.interviews.read'] },
  { key: 'offers', labelKey: 'admin.recruitmentOffers', defaultLabel: 'Offers', permissions: ['recruitment.offers.read'] },
  { key: 'departments', labelKey: 'admin.recruitmentDepartments', defaultLabel: 'Departments', permissions: ['recruitment.departments.read'] },
  { key: 'pipeline', labelKey: 'admin.recruitmentPipeline', defaultLabel: 'Pipeline Stages', permissions: ['recruitment.pipeline.read'] },
  { key: 'settings', labelKey: 'admin.recruitmentSettings', defaultLabel: 'Recruitment Settings', permissions: ['recruitment.settings.read', 'recruitment.settings.update'] },
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

  const directVerificationRoutes = [
    { paths: ['/admin/pan-verification', '/employee/pan-verification', '/superadmin/pan-verification'], permissions: PAN_VIEW_PERMISSIONS },
    { paths: ['/admin/gst-verification', '/employee/gst-verification', '/superadmin/gst-verification'], permissions: GST_VIEW_PERMISSIONS },
    { paths: ['/admin/driving-license-verification', '/employee/driving-license-verification', '/superadmin/driving-license-verification'], permissions: DRIVING_LICENSE_VIEW_PERMISSIONS },
  ];
  const matchedDirectVerificationRoute = directVerificationRoutes.find((route) =>
    route.paths.some((path) => pathname === path || pathname.startsWith(`${path}/`)),
  );
  if (matchedDirectVerificationRoute) {
    return matchedDirectVerificationRoute.permissions;
  }

  const matchedAccount = accountsNavItems.find((item) =>
    pathname === `/employee/accounts/${item.key}` ||
    pathname.startsWith(`/employee/accounts/${item.key}/`) ||
    pathname === `/superadmin/accounts/${item.key}` ||
    pathname.startsWith(`/superadmin/accounts/${item.key}/`)
  );
  if (matchedAccount) {
    return matchedAccount.permissions;
  }

  const matchedModule = employeeModuleNavItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  if (matchedModule) {
    return matchedModule.permissions;
  }

  const matchedAdminModule = adminNavItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return matchedAdminModule?.permissions || null;
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
  const billing = useApiBillingSummary();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [usersMenuExpansion, setUsersMenuExpansion] = useState<{ pathname: string; value: boolean | null }>({
    pathname: '',
    value: null,
  });
  const [sidebarSectionExpansion, setSidebarSectionExpansion] = useState<{ pathname: string; values: Record<string, boolean> }>({
    pathname: '',
    values: {},
  });
  const [isAccessRevoked, setIsAccessRevoked] = useState(false);
  const [isAccessInactive, setIsAccessInactive] = useState(false);
  // ─── Industry-standard timestamp-based notification tracking ───────────────
  // localStorage stores ISO timestamps of when each module was last visited.
  // The backend receives these timestamps and returns only NEW-since-then counts.
  // This survives logout/login because timestamps are keyed by user id.
  // ─────────────────────────────────────────────────────────────────────────────
  const getModuleSeenAt = (module: string) => {
    if (!user?.id) return null;
    const raw = typeof window !== 'undefined' ? localStorage.getItem(`badge_seen_at_${module}_${user.id}`) : null;
    return raw || null;
  };
  const setModuleSeenAt = (module: string, isoTimestamp: string) => {
    if (!user?.id) return;
    localStorage.setItem(`badge_seen_at_${module}_${user.id}`, isoTimestamp);
  };

  const [badges, setBadges] = useState<{
    enquiries: number;
    verifications: number;
    visitors: number;
    recurrence: number;
    listingsPendingApproval: number;
    recruitmentApplications: number;
    recruitmentInterviews: number;
  }>({
    enquiries: 0,
    verifications: 0,
    visitors: 0,
    recurrence: 0,
    listingsPendingApproval: 0,
    recruitmentApplications: 0,
    recruitmentInterviews: 0,
  });
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'EMPLOYEE';
  const isEmployee = user?.role === 'EMPLOYEE';
  const totalPendingNotifications =
    (badges.enquiries || 0) +
    (badges.verifications || 0) +
    (badges.listingsPendingApproval || 0) +
    (badges.recruitmentApplications || 0) +
    (badges.recruitmentInterviews || 0);
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
  const visibleRecruitmentNavItems = useMemo(
    () => (isSuperAdmin
      ? recruitmentNavItems
      : recruitmentNavItems.filter((item) => hasAnyPermission(userPermissions, item.permissions))),
    [isSuperAdmin, userPermissions]
  );
  const isRecruitmentSectionActive = pathname.startsWith('/superadmin/recruitment') || pathname.startsWith('/employee/recruitment');
  const [recruitmentMenuExpansion, setRecruitmentMenuExpansion] = useState<{ pathname: string; value: boolean | null }>({
    pathname: '',
    value: null,
  });
  const isRecruitmentMenuExpanded = recruitmentMenuExpansion.pathname === pathname
    ? recruitmentMenuExpansion.value
    : null;
  const isRecruitmentDropdownExpanded = isRecruitmentMenuExpanded ?? isRecruitmentSectionActive;

  const visibleAccountsNavItems = useMemo(
    () => (isSuperAdmin || user?.role === 'ADMIN'
      ? accountsNavItems
      : accountsNavItems.filter((item) => !item.permissions || hasAnyPermission(userPermissions, item.permissions))),
    [isSuperAdmin, user?.role, userPermissions]
  );

  const isPartnersSectionActive =
    pathname.startsWith('/superadmin/partners') ||
    pathname.startsWith('/employee/partners') ||
    pathname.startsWith('/superadmin/partner-agreements') ||
    pathname.startsWith('/employee/partner-agreements');
  const [partnersMenuExpansion, setPartnersMenuExpansion] = useState<{ pathname: string; value: boolean | null }>({
    pathname: '',
    value: null,
  });
  const isPartnersMenuExpanded = partnersMenuExpansion.pathname === pathname
    ? partnersMenuExpansion.value
    : null;
  const isPartnersDropdownExpanded = isPartnersMenuExpanded ?? isPartnersSectionActive;

  useEffect(() => {
    if (!hasHydrated) {
      hydrateAuth();
    }
  }, [hasHydrated, hydrateAuth]);

  // ─── Idle auto-logout (configurable via NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES) ───
  const idleTimeoutMs = (Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES) || 15) * 60 * 1000;
  useIdleAutoLogout({
    timeoutMs: idleTimeoutMs,
    warningMs: 60 * 1000,   // always warn 1 min before logout
    enabled: isAuthenticated,
    onLogout: () => {
      logout();
      router.replace('/login');
    },
  });
  // ─────────────────────────────────────────────────────────────────────────────

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

    if (isAdmin && !isEmployee) {
      const requiredPermissions = getRequiredPermissionsForPath(pathname);
      if (requiredPermissions && !hasAnyPermission(userPermissions, requiredPermissions)) {
        router.replace('/admin/dashboard');
        return;
      }
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
      try {
        // A health check must not hold the form hostage to a transient backend
        // restart, network timeout, or database hiccup. Confirmed auth failures
        // are handled separately below.
        const response = await api.get('/auth/profile', { timeout: 10000 });

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
  }, [hasHydrated, isAuthenticated, logout, router, updateUser, user?.role]);

  // ─── Industry-standard "last seen at" timestamp badge fetching ──────────────
  // On each fetch, we send the stored seenAt timestamps to the backend.
  // The backend returns only entries created AFTER those timestamps.
  // On visiting a module page, we update its seenAt to now — clearing the badge.
  // This is login/logout-safe: timestamps are keyed by user id in localStorage.
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || (!isSuperAdmin && !isAdmin)) return;

    // Mark current page as "seen" immediately when we navigate to it
    const markCurrentPageSeen = () => {
      const now = new Date().toISOString();
      if (pathname.startsWith('/superadmin/enquiries') || pathname.startsWith('/employee/enquiries')) {
        setModuleSeenAt('enquiries', now);
      }
      if (pathname.startsWith('/superadmin/visitors') || pathname.startsWith('/employee/visitors')) {
        setModuleSeenAt('visitors', now);
      }
      if (pathname.startsWith('/superadmin/recurrence') || pathname.startsWith('/employee/recurrence')) {
        setModuleSeenAt('recurrence', now);
      }
      if (pathname.startsWith('/superadmin/recruitment/applications') || pathname.startsWith('/employee/recruitment/applications')) {
        setModuleSeenAt('recruitmentApplications', now);
      }
      if (pathname.startsWith('/superadmin/recruitment/interviews') || pathname.startsWith('/employee/recruitment/interviews')) {
        setModuleSeenAt('recruitmentInterviews', now);
      }
    };
    markCurrentPageSeen();

    let isMounted = true;
    const fetchBadges = async () => {
      try {
        // Build query params with per-module seenAt timestamps
        const params = new URLSearchParams();
        const enquiriesSeenAt = getModuleSeenAt('enquiries');
        const visitorsSeenAt = getModuleSeenAt('visitors');
        const recurrenceSeenAt = getModuleSeenAt('recurrence');
        const recruitmentAppsSeenAt = getModuleSeenAt('recruitmentApplications');
        const recruitmentIntervsSeenAt = getModuleSeenAt('recruitmentInterviews');
        if (enquiriesSeenAt) params.set('seenAt[enquiries]', enquiriesSeenAt);
        if (visitorsSeenAt) params.set('seenAt[visitors]', visitorsSeenAt);
        if (recurrenceSeenAt) params.set('seenAt[recurrence]', recurrenceSeenAt);
        if (recruitmentAppsSeenAt) params.set('seenAt[recruitmentApplications]', recruitmentAppsSeenAt);
        if (recruitmentIntervsSeenAt) params.set('seenAt[recruitmentInterviews]', recruitmentIntervsSeenAt);

        const response = await api.get(`/superadmin/badges?${params.toString()}`);
        if (isMounted && response.data?.badges) {
          const b = response.data.badges;
          setBadges({
            enquiries: b.enquiries || 0,
            verifications: b.verifications || 0,
            visitors: b.visitors || 0,
            recurrence: b.recurrence || 0,
            listingsPendingApproval: b.listingsPendingApproval || 0,
            recruitmentApplications: b.recruitmentApplications || 0,
            recruitmentInterviews: b.recruitmentInterviews || 0,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, isAuthenticated, isSuperAdmin, isAdmin, pathname, user?.id]);

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

  const baseVisibleNavItems = isSuperAdmin
    ? navItems
    : isEmployee
      ? employeeNavItems
      : adminNavItems.filter((item) => !item.permissions || hasAnyPermission(userPermissions, item.permissions));
  const uniqueBaseVisibleNavItems = baseVisibleNavItems.filter(
    (item, index, items) => items.findIndex((candidate) => candidate.href === item.href) === index,
  );
  const visibleNavItems = uniqueBaseVisibleNavItems;
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
    '/superadmin/analytics': t('admin.analytics'),
    '/superadmin/accounts/rto-work-status': t('admin.rtoWork', 'RTO Work'),
    '/superadmin/accounts/sell-accounts': t('admin.soldVehicles', 'Sold Vehicles'),
    '/superadmin/invoices': t('admin.invoices', 'Invoices'),
    '/superadmin/tasks': t('admin.tasks', 'Tasks'),
    '/superadmin/finance/expenses': t('admin.expenses', 'Expenses & Transactions'),
    '/superadmin/finance/workspace': t('admin.financeWorkspace', 'Financial Reports & CA Workspace'),
    '/admin/accounts/rto-work-status': t('admin.rtoWork', 'RTO Work'),
    '/admin/accounts/sell-accounts': t('admin.soldVehicles', 'Sold Vehicles'),
    '/admin/invoices': t('admin.invoices', 'Invoices'),
    '/admin/tasks': t('admin.tasks', 'Tasks'),
    '/admin/finance/expenses': t('admin.expenses', 'Expenses & Transactions'),
    '/admin/finance/workspace': t('admin.financeWorkspace', 'Financial Reports & CA Workspace'),
    '/employee/accounts/rto-work-status': t('admin.rtoWork', 'RTO Work'),
    '/employee/accounts/sell-accounts': t('admin.soldVehicles', 'Sold Vehicles'),
    '/employee/invoices': t('admin.invoices', 'Invoices'),
    '/employee/tasks': t('admin.tasks', 'Tasks'),
    '/employee/finance/expenses': t('admin.expenses', 'Expenses & Transactions'),
    '/employee/finance/workspace': t('admin.financeWorkspace', 'Financial Reports & CA Workspace'),
    '/superadmin/verifications': t('admin.partnerVerifications'),
    '/superadmin/identity-hub': t('admin.identityHub', 'Identity Hub'),
    '/superadmin/vehicle-transport': t('admin.vehicleTransport', 'Vehicle & Transport'),
    '/superadmin/driving-license-verification': t('admin.vehicleTransport', 'Vehicle & Transport'),
    '/superadmin/partners': t('admin.partnerDirectory'),
    '/superadmin/leads': t('admin.visitors'),
    '/superadmin/enquiries': t('admin.enquiryManagement'),
    '/superadmin/whatsapp': t('whatsappModule.pageTitle', 'WhatsApp Cloud API'),
    '/superadmin/sms': t('smsModule.pageTitle', 'SMS Notifications'),
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
    '/superadmin/footer': t('admin.footerContent'),
    '/superadmin/partner-agreements': t('admin.partnerAgreements', 'Partner Agreements'),
    '/superadmin/blogs': t('admin.blog', 'Blog'),
    '/superadmin/recruitment/dashboard': t('admin.recruitmentDashboard', 'Recruitment Dashboard'),
    '/superadmin/recruitment/jobs': t('admin.recruitmentJobs', 'Jobs'),
    '/superadmin/recruitment/applications': t('admin.recruitmentApplications', 'Applications'),
    '/superadmin/recruitment/candidates': t('admin.recruitmentCandidates', 'Candidates'),
    '/superadmin/recruitment/departments': t('admin.recruitmentDepartments', 'Departments'),
    '/superadmin/recruitment/interviews': t('admin.recruitmentInterviews', 'Interviews'),
    '/superadmin/recruitment/offers': t('admin.recruitmentOffers', 'Offers'),
    '/superadmin/recruitment/pipeline': t('admin.recruitmentPipeline', 'Pipeline Stages'),
    '/superadmin/recruitment/settings': t('admin.recruitmentSettings', 'Recruitment Settings'),
    '/admin/dashboard': isEmployee ? t('admin.employeeDashboard') : t('admin.adminDashboard'),
    '/admin/analytics': t('admin.analytics'),
    '/admin/identity-hub': t('admin.identityHub', 'Identity Hub'),
    '/admin/vehicle-transport': t('admin.vehicleTransport', 'Vehicle & Transport'),
    '/admin/driving-license-verification': t('admin.vehicleTransport', 'Vehicle & Transport'),
    '/admin/profile': t('admin.myProfilePage'),
    '/employee/dashboard': t('admin.employeeDashboard'),
    '/employee/analytics': t('admin.analytics'),
    '/employee/enquiries': t('admin.enquiryManagement'),
    '/employee/whatsapp': t('whatsappModule.pageTitle', 'WhatsApp Cloud API'),
    '/employee/sms': t('smsModule.pageTitle', 'SMS Notifications'),
    '/employee/verifications': t('admin.partnerVerifications'),
    '/employee/identity-hub': t('admin.identityHub', 'Identity Hub'),
    '/employee/vehicle-transport': t('admin.vehicleTransport', 'Vehicle & Transport'),
    '/employee/driving-license-verification': t('admin.vehicleTransport', 'Vehicle & Transport'),
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
    '/employee/footer': t('admin.footerContent'),
    '/employee/partner-agreements': t('admin.partnerAgreements', 'Partner Agreements'),
    '/employee/recruitment/dashboard': t('admin.recruitmentDashboard', 'Recruitment Dashboard'),
    '/employee/recruitment/jobs': t('admin.recruitmentJobs', 'Jobs'),
    '/employee/recruitment/applications': t('admin.recruitmentApplications', 'Applications'),
    '/employee/recruitment/candidates': t('admin.recruitmentCandidates', 'Candidates'),
    '/employee/recruitment/departments': t('admin.recruitmentDepartments', 'Departments'),
    '/employee/recruitment/interviews': t('admin.recruitmentInterviews', 'Interviews'),
    '/employee/recruitment/offers': t('admin.recruitmentOffers', 'Offers'),
    '/employee/recruitment/pipeline': t('admin.recruitmentPipeline', 'Pipeline Stages'),
    '/employee/recruitment/settings': t('admin.recruitmentSettings', 'Recruitment Settings'),
  };
  const getPageTitle = () => {
    if (pageTitleMap[pathname]) return pageTitleMap[pathname];
    if (pathname.includes('/accounts/sell-accounts/')) return t('admin.soldVehicle', 'Sold Vehicle');
    if (pathname.includes('/accounts/rto-work-status/')) return t('admin.rtoWork', 'RTO Work');
    if (isFinanceTransactionDetailPath(pathname)) return t('admin.transactionDetails', 'Transaction Details');
    if (pathname.startsWith('/superadmin/analytics/') || pathname.startsWith('/admin/analytics/') || pathname.startsWith('/employee/analytics/')) {
      return t('admin.analyticsDetail', 'Listing Analytics');
    }
    if (pathname.startsWith('/superadmin/enquiries/') || pathname.startsWith('/employee/enquiries/')) return t('admin.enquiryDetails');
    if (pathname.startsWith('/superadmin/partners/') || pathname.startsWith('/employee/partners/')) {
      if (pathname.endsWith('/edit')) return t('admin.editPartnerProfile');
      if (pathname.endsWith('/deposit')) return t('admin.partnerDeposit');
      return t('admin.partnerDetails');
    }
    if (pathname.startsWith('/superadmin/verifications/') || pathname.startsWith('/employee/verifications/')) return t('admin.verificationDetails');
    if (pathname.startsWith('/superadmin/recruitment/applications/') || pathname.startsWith('/employee/recruitment/applications/')) {
      return t('admin.recruitmentApplicationDetails', 'Application Details');
    }
    if (pathname.startsWith('/superadmin/recruitment/jobs/') || pathname.startsWith('/employee/recruitment/jobs/')) {
      return t('admin.recruitmentJobDetails', 'Job Details');
    }
    return isSuperAdmin ? t('admin.superAdminDashboard') : isEmployee ? t('admin.employeeDashboard') : t('admin.adminDashboard');
  };
  const pageTitle = getPageTitle();
  const profileHref = isSuperAdmin ? '/superadmin/profile' : isEmployee ? '/employee/profile' : '/admin/profile';
  const settingsHref = isSuperAdmin ? '/superadmin/settings' : isEmployee ? '/employee/settings' : '/admin/profile';
  const isUsersSectionActive = pathname.startsWith('/superadmin/users') || pathname.startsWith('/employee/users');
  const isUsersMenuExpanded = usersMenuExpansion.pathname === pathname
    ? usersMenuExpansion.value
    : null;
  const isUsersDropdownExpanded = isUsersMenuExpanded ?? isUsersSectionActive;
  const usersListHref = isEmployee ? '/employee/users' : '/superadmin/users';
  const rolesListHref = isEmployee ? '/employee/users/roles' : '/superadmin/users/roles';
  const routePrefix = isSuperAdmin ? '/superadmin' : isEmployee ? '/employee' : '/admin';
  const getVisibleNavItem = (suffix: string) => visibleNavItems.find((item) => item.href.endsWith(suffix));
  const dashboardNavItem = getVisibleNavItem('/dashboard');
  const partnersNavItem = getVisibleNavItem('/partners');
  const partnerAgreementsNavItem = getVisibleNavItem('/partner-agreements');
  const canShowPartnersMenu = Boolean(partnersNavItem || partnerAgreementsNavItem);
  const canShowSettingsLink = isSuperAdmin || Boolean(getVisibleNavItem('/settings'));
  const canShowUsersMenu = isSuperAdmin || (isEmployee && (employeeCanSeeUsers || employeeCanSeeRoles));
  // Sold Vehicles and RTO Work sit right after Listings in Daily Operations.
  const accountsSidebarIcons = { 'sell-accounts': HandCoins, 'rto-work-status': ClipboardCheck } as const;
  const accountsSidebarItems = (['sell-accounts', 'rto-work-status'] as const)
    .map((key) => visibleAccountsNavItems.find((item) => item.key === key))
    .filter((item) => item !== undefined)
    .map((item) => ({
      href: `${routePrefix}/accounts/${item.key}`,
      labelKey: item.labelKey,
      defaultLabel: item.defaultLabel,
      icon: accountsSidebarIcons[item.key],
    }));
  const hasDailyOperationsNav = accountsSidebarItems.length > 0 || [
    '/enquiries',
    '/listings',
    '/tasks',
    '/verifications',
    '/identity-hub',
    '/vehicle-transport',
    '/visitors',
  ].some((suffix) => Boolean(getVisibleNavItem(suffix))) || canShowPartnersMenu;
  const hasFinanceNav = ['/finance/workspace', '/finance/expenses', '/recurrence', '/invoices'].some((suffix) => Boolean(getVisibleNavItem(suffix)));
  const hasReportsNav = Boolean(getVisibleNavItem('/analytics'));
  const hasCommunicationsNav = ['/whatsapp', '/sms'].some((suffix) => Boolean(getVisibleNavItem(suffix)));
  const hasContentNav = ['/blogs', '/categories', '/brands', '/footer', '/translations'].some((suffix) => Boolean(getVisibleNavItem(suffix)));
  const hasAdministrationNav = canShowUsersMenu || canShowSettingsLink;
  const isRouteUnder = (suffix: string) => pathname === `${routePrefix}${suffix}` || pathname.startsWith(`${routePrefix}${suffix}/`);
  const sidebarSectionActive: Record<string, boolean> = {
    finance: ['/finance', '/recurrence', '/invoices'].some(isRouteUnder),
    reports: isRouteUnder('/analytics'),
    recruitment: isRecruitmentSectionActive,
    communications: ['/whatsapp', '/sms'].some(isRouteUnder),
    content: ['/blogs', '/categories', '/brands', '/footer', '/translations'].some(isRouteUnder),
    administration: isUsersSectionActive || pathname === settingsHref,
  };
  // Sections stay collapsed by default; the section holding the current page opens automatically.
  const isSidebarSectionExpanded = (key: string) => {
    const override = sidebarSectionExpansion.pathname === pathname ? sidebarSectionExpansion.values[key] : undefined;
    return override ?? Boolean(sidebarSectionActive[key]);
  };
  const toggleSidebarSection = (key: string) => {
    const nextValue = !isSidebarSectionExpanded(key);
    setSidebarSectionExpansion((current) => ({
      pathname,
      values: { ...(current.pathname === pathname ? current.values : {}), [key]: nextValue },
    }));
  };

  const getNavBadgeCount = (href: string) => {
    if (href.includes('enquiries')) return badges.enquiries || 0;
    if (href.includes('listings')) return badges.listingsPendingApproval || 0;
    if (href.includes('verifications')) return pathname.startsWith(href) ? 0 : badges.verifications;
    if (href.includes('visitors')) return badges.visitors || 0;
    if (href.includes('recurrence')) return badges.recurrence || 0;
    return 0;
  };

  const sectionLabelClassName = 'text-[11px] font-semibold uppercase tracking-[0.12em]';

  const renderSectionLabel = (label: string) => (
    <p className={`px-4 pb-2 pt-4 text-gray-500 ${sectionLabelClassName}`}>
      {label}
    </p>
  );

  const renderCollapsibleSectionLabel = (key: string, label: string, badgeCount = 0) => {
    const isExpanded = isSidebarSectionExpanded(key);
    const isGroupActive = Boolean(sidebarSectionActive[key]);

    return (
      <>
        <div className="mx-4 mb-2 mt-3 h-px bg-white/[0.06]" />
        <button
          type="button"
          onClick={() => toggleSidebarSection(key)}
          aria-expanded={isExpanded}
          className="group flex w-full items-center gap-2 rounded-md px-4 py-2 text-left transition-colors duration-150 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FFC107]/60"
        >
          <span
            className={`flex-1 transition-colors duration-150 ${sectionLabelClassName} ${isGroupActive ? 'text-gray-200' : 'text-gray-500 group-hover:text-gray-300'}`}
          >
            {label}
          </span>
          {!isExpanded && badgeCount > 0 ? (
            <span className="min-w-[1.25rem] rounded-full bg-red-500/90 px-1.5 py-px text-center text-[10px] font-semibold leading-4 text-white">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          ) : null}
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-gray-600 transition-all duration-200 group-hover:text-gray-400 ${isExpanded ? 'rotate-90' : ''}`}
          />
        </button>
      </>
    );
  };

  const renderCollapsibleSectionBody = (key: string, content: ReactNode) => {
    const isExpanded = isSidebarSectionExpanded(key);

    return (
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
        inert={!isExpanded}
      >
        <div className="min-h-0 space-y-1 overflow-hidden">{content}</div>
      </div>
    );
  };

  const renderStandardNavItem = (item: ((typeof visibleNavItems)[number] & { defaultLabel?: string }) | undefined) => {
    if (!item) return null;

    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = item.icon;
    const badgeCount = getNavBadgeCount(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setIsMobileMenuOpen(false)}
        className={`flex items-center justify-between rounded-lg border px-4 py-2.5 transition-all duration-200 ${isActive
          ? 'border-[#FFC107] bg-[#FFC107]/5 font-semibold text-white'
          : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-white'
          }`}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <Icon className={`h-5 w-5 ${isActive ? 'text-[#FFC107]' : ''}`} />
            {badgeCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
            ) : null}
          </div>
          <span>{item.defaultLabel ? t(item.labelKey, item.defaultLabel) : t(item.labelKey)}</span>
        </div>
        {badgeCount > 0 ? (
          <span className="min-w-[1.25rem] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#1A1A1A] text-white flex flex-col shrink-0 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 h-screen overflow-hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-[10px] border-b border-white/10">
          <div>
            <PortalBrand href={isSuperAdmin ? '/superadmin/dashboard' : isEmployee ? employeeHomeHref : '/admin/dashboard'} maxHeightClassName="max-h-[70px]" />
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-colors z-10"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar-dark">
          {renderStandardNavItem(dashboardNavItem)}

          {hasDailyOperationsNav ? (
            <section className="space-y-1">
              {renderSectionLabel('Daily Operations')}
              {renderStandardNavItem(getVisibleNavItem('/enquiries'))}
              {renderStandardNavItem(getVisibleNavItem('/listings'))}
              {accountsSidebarItems.map((item) => renderStandardNavItem(item))}
              {renderStandardNavItem(getVisibleNavItem('/tasks'))}
              {renderStandardNavItem(getVisibleNavItem('/verifications'))}
              {renderStandardNavItem(getVisibleNavItem('/identity-hub'))}
              {renderStandardNavItem(getVisibleNavItem('/vehicle-transport'))}

              {canShowPartnersMenu ? (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setPartnersMenuExpansion({
                      pathname,
                      value: !isPartnersDropdownExpanded,
                    })}
                    className={`flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left transition-all duration-200 ${isPartnersSectionActive
                      ? 'border-[#FFC107] bg-[#FFC107]/5 font-semibold text-white'
                      : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                  >
                    <span className="flex items-center gap-3">
                      <List className={`h-5 w-5 ${isPartnersSectionActive ? 'text-[#FFC107]' : ''}`} />
                      <span>{t('admin.partners', 'Partners')}</span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${isPartnersDropdownExpanded ? 'rotate-180' : ''} ${isPartnersSectionActive ? 'text-[#FFC107]' : 'text-gray-500'}`}
                    />
                  </button>

                  {isPartnersDropdownExpanded ? (
                    <div className="ml-4 space-y-1 border-l border-white/10 pl-3">
                      {partnersNavItem ? (
                        <Link
                          href={partnersNavItem.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`flex items-center gap-3 rounded-lg px-4 py-2 text-sm transition-all duration-200 ${pathname === partnersNavItem.href || pathname.startsWith(`${partnersNavItem.href}/`)
                            ? 'bg-[#FFC107]/10 font-semibold text-white'
                            : 'text-gray-400 hover:bg-white/5 hover:text-white'
                            }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          <span>All Partners</span>
                        </Link>
                      ) : null}
                      {partnerAgreementsNavItem ? (
                        <Link
                          href={partnerAgreementsNavItem.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`flex items-center gap-3 rounded-lg px-4 py-2 text-sm transition-all duration-200 ${pathname === partnerAgreementsNavItem.href
                            ? 'bg-[#FFC107]/10 font-semibold text-white'
                            : 'text-gray-400 hover:bg-white/5 hover:text-white'
                            }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          <span>{t('admin.partnerAgreements', 'Partner Agreements')}</span>
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {renderStandardNavItem(getVisibleNavItem('/visitors'))}
            </section>
          ) : null}

          {hasFinanceNav ? (
            <section className="space-y-1">
              {renderCollapsibleSectionLabel('finance', 'Finance & Accounts', badges.recurrence || 0)}
              {renderCollapsibleSectionBody('finance', (
              <>
              {renderStandardNavItem(getVisibleNavItem('/finance/workspace'))}
              {renderStandardNavItem(getVisibleNavItem('/invoices'))}
              {renderStandardNavItem(getVisibleNavItem('/finance/expenses'))}
              {renderStandardNavItem(getVisibleNavItem('/recurrence'))}
              </>
              ))}
            </section>
          ) : null}

          {hasReportsNav ? (
            <section className="space-y-1">
              {renderCollapsibleSectionLabel('reports', 'Reports')}
              {renderCollapsibleSectionBody('reports', renderStandardNavItem(getVisibleNavItem('/analytics')))}
            </section>
          ) : null}

          {visibleRecruitmentNavItems.length > 0 ? (
            <section className="space-y-1">
              {renderCollapsibleSectionLabel(
                'recruitment',
                'Recruitment',
                (badges.recruitmentApplications || 0) + (badges.recruitmentInterviews || 0),
              )}
              {renderCollapsibleSectionBody('recruitment', (
              <>
              <button
                type="button"
                onClick={() => setRecruitmentMenuExpansion({
                  pathname,
                  value: !isRecruitmentDropdownExpanded,
                })}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left transition-all duration-200 ${isRecruitmentSectionActive
                    ? 'border-[#FFC107] bg-[#FFC107]/5 font-semibold text-white'
                    : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
              >
                <span className="flex items-center gap-3">
                  <div className="relative">
                    <Briefcase className={`h-5 w-5 ${isRecruitmentSectionActive ? 'text-[#FFC107]' : ''}`} />
                    {(badges.recruitmentApplications || 0) + (badges.recruitmentInterviews || 0) > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                      </span>
                    )}
                  </div>
                  <span>{t('admin.recruitment', 'Recruitment')}</span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${isRecruitmentDropdownExpanded ? 'rotate-180' : ''} ${isRecruitmentSectionActive ? 'text-[#FFC107]' : 'text-gray-500'
                    }`}
                />
              </button>

              {isRecruitmentDropdownExpanded ? (
                <div className="ml-4 space-y-1 border-l border-white/10 pl-3">
                  {visibleRecruitmentNavItems.map((item) => {
                    const prefix = isEmployee ? '/employee' : '/superadmin';
                    const href = `${prefix}/recruitment/${item.key}`;
                    const isActive = pathname === href || pathname.startsWith(`${href}/`);

                    let badgeCount = 0;
                    if (item.key === 'applications') {
                      badgeCount = (badges.recruitmentApplications || 0);
                    } else if (item.key === 'interviews') {
                      badgeCount = (badges.recruitmentInterviews || 0);
                    }

                    return (
                      <Link
                        key={item.key}
                        href={href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center justify-between rounded-lg px-4 py-2 text-sm transition-all duration-200 ${isActive
                            ? 'bg-[#FFC107]/10 font-semibold text-white'
                            : 'text-gray-400 hover:bg-white/5 hover:text-white'
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-[#FFC107]' : 'bg-current'}`} />
                          <span>{t(item.labelKey, item.defaultLabel)}</span>
                        </div>
                        {badgeCount > 0 && (
                          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                            {badgeCount > 99 ? '99+' : badgeCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
              </>
              ))}
            </section>
          ) : null}

          {hasCommunicationsNav ? (
            <section className="space-y-1">
              {renderCollapsibleSectionLabel('communications', 'Communications')}
              {renderCollapsibleSectionBody('communications', (
                <>
                  {renderStandardNavItem(getVisibleNavItem('/whatsapp'))}
                  {renderStandardNavItem(getVisibleNavItem('/sms'))}
                </>
              ))}
            </section>
          ) : null}

          {hasContentNav ? (
            <section className="space-y-1">
              {renderCollapsibleSectionLabel('content', 'Content & Website')}
              {renderCollapsibleSectionBody('content', (
                <>
                  {renderStandardNavItem(getVisibleNavItem('/blogs'))}
                  {renderStandardNavItem(getVisibleNavItem('/categories'))}
                  {renderStandardNavItem(getVisibleNavItem('/brands'))}
                  {renderStandardNavItem(getVisibleNavItem('/footer'))}
                  {renderStandardNavItem(getVisibleNavItem('/translations'))}
                </>
              ))}
            </section>
          ) : null}

          {hasAdministrationNav ? (
            <section className="space-y-1">
              {renderCollapsibleSectionLabel('administration', 'Administration')}
              {renderCollapsibleSectionBody('administration', (
              <>
              {canShowUsersMenu ? (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setUsersMenuExpansion({
                      pathname,
                      value: !isUsersDropdownExpanded,
                    })}
                    className={`flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left transition-all duration-200 ${isUsersSectionActive
                      ? 'border-[#FFC107] bg-[#FFC107]/5 font-semibold text-white'
                      : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                  >
                    <span className="flex items-center gap-3">
                      <Users className={`h-5 w-5 ${isUsersSectionActive ? 'text-[#FFC107]' : ''}`} />
                      <span>{t('admin.users')}</span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${isUsersDropdownExpanded ? 'rotate-180' : ''} ${isUsersSectionActive ? 'text-[#FFC107]' : 'text-gray-500'}`}
                    />
                  </button>

                  {isUsersDropdownExpanded ? (
                    <div className="ml-4 space-y-1 border-l border-white/10 pl-3">
                      {isSuperAdmin || employeeCanSeeUsers ? (
                        <Link
                          href={usersListHref}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`flex items-center gap-3 rounded-lg px-4 py-2 text-sm transition-all duration-200 ${pathname === usersListHref
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
                          className={`flex items-center gap-3 rounded-lg px-4 py-2 text-sm transition-all duration-200 ${pathname === rolesListHref
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

              {canShowSettingsLink ? (
                <Link
                  href={settingsHref}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 transition-all duration-200 ${pathname === settingsHref
                    ? 'border-[#FFC107] bg-[#FFC107]/5 font-semibold text-white'
                    : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                >
                  <Settings className={`h-5 w-5 ${pathname === settingsHref ? 'text-[#FFC107]' : ''}`} />
                  <span>{t('common.settings')}</span>
                </Link>
              ) : null}
              </>
              ))}
            </section>
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
        <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-3 sm:px-4 lg:px-5 py-1.5 sm:py-2 flex justify-between items-center shrink-0 z-30 sticky top-0 transition-all">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-1.5 -ml-1 text-slate-600 hover:bg-slate-100 rounded-lg shrink-0"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5 text-slate-700" />
            </button>
            {customHeader || (
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="font-bold text-sm sm:text-base text-slate-900 truncate tracking-tight">{pageTitle}</h1>
                <span className="hidden md:inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
            )}
          </div>
          <div className="ml-2 flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Quick Public Site Link */}
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              title="View Public Marketplace Frontend"
              className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors shrink-0"
            >
              <ExternalLink className="w-3 h-3 text-slate-500" />
              <span>Public Site</span>
            </a>

            {/* Notification Bell Dropdown */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className={`relative p-1.5 rounded-lg border transition-all ${
                  isNotificationOpen
                    ? "bg-amber-50 text-amber-900 border-amber-300"
                    : "text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border-slate-200"
                }`}
                title="Pending Tasks & Action Items"
              >
                <Bell className="w-4 h-4 text-slate-600" />
                {totalPendingNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-slate-950 ring-2 ring-white">
                    {totalPendingNotifications > 99 ? "99+" : totalPendingNotifications}
                  </span>
                )}
              </button>

              {isNotificationOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsNotificationOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden divide-y divide-slate-100 animate-in fade-in duration-150">
                    <div className="p-2.5 bg-slate-50 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Operational Action Items</span>
                      <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                        {totalPendingNotifications} total
                      </span>
                    </div>
                    <div className="p-1.5 space-y-0.5 text-xs">
                      {badges.verifications > 0 && (
                        <Link
                          href="/superadmin/verifications"
                          onClick={() => setIsNotificationOpen(false)}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-orange-50 text-slate-700 hover:text-orange-950 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <ShieldCheck className="w-3.5 h-3.5 text-orange-600" />
                            <span>KYC Pending</span>
                          </span>
                          <span className="font-bold text-orange-800 bg-orange-100 px-1.5 py-0.5 rounded text-[10px]">
                            {badges.verifications}
                          </span>
                        </Link>
                      )}
                      {badges.listingsPendingApproval > 0 && (
                        <Link
                          href="/superadmin/listings"
                          onClick={() => setIsNotificationOpen(false)}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-blue-50 text-slate-700 hover:text-blue-950 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <Truck className="w-3.5 h-3.5 text-blue-600" />
                            <span>Listings Review</span>
                          </span>
                          <span className="font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded text-[10px]">
                            {badges.listingsPendingApproval}
                          </span>
                        </Link>
                      )}
                      {badges.enquiries > 0 && (
                        <Link
                          href="/superadmin/enquiries"
                          onClick={() => setIsNotificationOpen(false)}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-purple-50 text-slate-700 hover:text-purple-950 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <MessagesSquare className="w-3.5 h-3.5 text-purple-600" />
                            <span>New Leads</span>
                          </span>
                          <span className="font-bold text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded text-[10px]">
                            {badges.enquiries}
                          </span>
                        </Link>
                      )}
                      {totalPendingNotifications === 0 && (
                        <div className="py-4 text-center text-xs text-slate-400">
                          All operational queues are clear!
                        </div>
                      )}
                    </div>
                  </div>
                </> 
              )}
            </div>

            <div className="h-4 w-px bg-slate-200 hidden sm:block" />

            <ApiWalletHeader {...billing} />
            <LanguageSwitcher />

            <div className="h-4 w-px bg-slate-200 hidden sm:block" />

            {/* Profile Dropdown Container */}
            <div className="relative shrink-0">
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
                title={`${displayName} (${translatedRoleLabel})`}
              >
                {/* User Name & Role Pill */}
                <div className="text-right hidden sm:flex flex-col items-end justify-center min-w-0">
                  <span className="text-xs font-bold text-slate-900 tracking-tight leading-tight truncate max-w-[130px] group-hover:text-slate-950">
                    {displayName}
                  </span>
                  <div className="mt-0.5 flex items-center">
                    <span className="inline-flex items-center rounded-sm bg-amber-100/90 px-1.5 py-0.25 text-[8.5px] font-black uppercase tracking-wider text-amber-950 border border-amber-200/80 leading-none">
                      {translatedRoleLabel}
                    </span>
                  </div>
                </div>

                {/* Avatar with Live Indicator */}
                <div className="relative shrink-0">
                  <UserAvatar user={user} size="header-compact" />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1.5 ring-white shadow-2xs"
                    title="Active Session"
                  />
                </div>

                {/* Animated Chevron */}
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
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsDropdownOpen(false)}
                  />

                  <div className="absolute right-0 top-full mt-2 w-68 bg-white border border-slate-200/90 rounded-2xl shadow-xl z-50 overflow-hidden divide-y divide-slate-100 transform origin-top-right transition-all duration-150 ease-out animate-in fade-in zoom-in-95">
                    {/* Header Summary */}
                    <div className="px-4 py-3.5 bg-gradient-to-b from-slate-50/90 to-white flex items-center gap-3">
                      <div className="relative shrink-0">
                        <UserAvatar user={user} size="header" />
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold text-slate-900 truncate">{displayName}</p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{user.email || t('common.adminEmailFallback')}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="inline-flex items-center rounded-sm bg-amber-100 px-1.5 py-0.25 text-[8.5px] font-black uppercase tracking-wider text-amber-950 border border-amber-200">
                            {translatedRoleLabel}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Navigation Items */}
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

                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          router.push(settingsHref);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-slate-950 rounded-lg transition-colors group"
                      >
                        <div className="flex items-center gap-2.5">
                          <Settings className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
                          <span className="font-semibold">{t('common.settings')}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">System</span>
                      </button>
                    </div>

                    {/* Logout Footer */}
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
        <div className="p-3 sm:p-4 lg:p-4.5 overflow-y-auto flex-1 custom-scrollbar bg-gray-100 overscroll-contain pb-10 sm:pb-12">{children}</div>
      </main>
      <PushNotificationManager />
    </div>
  );
}
