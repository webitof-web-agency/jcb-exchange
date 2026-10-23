import { resolveEmployeePortalRoute } from './portalRoutes';

type LoginRedirectUser = {
  role: string;
  permissions?: string[];
  accountStatus?: string | null;
  onboardingStatus?: string | null;
  kycStatus?: string | null;
};

const isSafePortalPath = (value?: string | null) => Boolean(value && value.startsWith('/') && !value.startsWith('//'));

const portalRoutePrefixes: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  // The legacy ADMIN role uses the employee portal, limited to its permissions.
  ADMIN: '/employee',
  EMPLOYEE: '/employee',
  PARTNER: '/partner',
};

const getRoleHomeRoute = (role: string) => {
  if (role === 'SUPER_ADMIN') return '/admin/dashboard';
  if (role === 'EMPLOYEE') return '/employee/dashboard';
  if (role === 'PARTNER') return '/partner/dashboard';
  return null;
};

const getRoleSafeNextRoute = (role: string, nextRoute?: string | null) => {
  const routePrefix = portalRoutePrefixes[role];
  if (!routePrefix || !nextRoute || !isSafePortalPath(nextRoute)) {
    return null;
  }

  return nextRoute === routePrefix || nextRoute.startsWith(`${routePrefix}/`) ? nextRoute : null;
};

export const resolveLoginRedirect = (user: LoginRedirectUser, nextRoute?: string | null) => {
  const requestedRoute = getRoleSafeNextRoute(user.role, nextRoute);

  if (user.role === 'SUPER_ADMIN') return requestedRoute || getRoleHomeRoute(user.role);
  if (user.role === 'EMPLOYEE' || user.role === 'ADMIN') {
    return resolveEmployeePortalRoute(requestedRoute || '/employee/dashboard', user.permissions);
  }
  if (user.role === 'PARTNER') {
    return user.accountStatus === 'ACTIVE' && user.onboardingStatus === 'APPROVED' && user.kycStatus === 'APPROVED'
      ? requestedRoute || getRoleHomeRoute(user.role)
      : '/partner/kyc';
  }

  return null;
};
