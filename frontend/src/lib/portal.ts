import { formatPartnerTypeLabel } from '@/lib/partnerType';

const PARTNER_PORTAL_ORIGIN =
  process.env.NEXT_PUBLIC_PARTNER_PORTAL_URL || 'http://localhost:3001';

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

export const PORTAL_ROLES = ['PARTNER', 'SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'];

const PORTAL_HOME_ROUTES: Record<string, string> = {
  PARTNER: '/partner/dashboard',
  SUPER_ADMIN: '/superadmin/dashboard',
  ADMIN: '/admin/dashboard',
  EMPLOYEE: '/employee/dashboard',
};

const PORTAL_ROUTE_PREFIXES: Record<string, string> = {
  PARTNER: '/partner',
  SUPER_ADMIN: '/superadmin',
  ADMIN: '/admin',
  EMPLOYEE: '/employee',
};

const isSafeRelativePath = (value?: string | null) =>
  Boolean(value && value.startsWith('/') && !value.startsWith('//'));

export const getPortalHomeRoute = (role?: string | null, requestedPath?: string | null) => {
  if (!role || !PORTAL_ROLES.includes(role)) {
    return requestedPath && isSafeRelativePath(requestedPath) ? requestedPath : '/profile';
  }

  const defaultPath = PORTAL_HOME_ROUTES[role];
  const routePrefix = PORTAL_ROUTE_PREFIXES[role];

  if (
    requestedPath &&
    isSafeRelativePath(requestedPath) &&
    (requestedPath === routePrefix || requestedPath.startsWith(`${routePrefix}/`))
  ) {
    return requestedPath;
  }

  return defaultPath;
};

export const getPublicRoleLabel = ({
  role,
  partnerType,
  isPrimeCustomer,
}: {
  role?: string | null;
  partnerType?: string | null;
  isPrimeCustomer?: boolean;
}) => {
  switch (role) {
    case 'PARTNER':
      return formatPartnerTypeLabel(partnerType, 'Partner');
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'ADMIN':
      return 'Admin';
    case 'EMPLOYEE':
      return 'Employee';
    case 'CUSTOMER':
      return isPrimeCustomer ? 'Prime Customer' : '';
    default:
      return '';
  }
};

export const getPortalMenuLabel = (role?: string | null) =>
  role && PORTAL_ROLES.includes(role) ? 'My Portal' : 'My Profile';

export const getPortalTarget = ({
  role,
  token,
  fallbackPath,
}: {
  role?: string | null;
  token?: string | null;
  fallbackPath?: string | null;
}) => {
  if (role && PORTAL_ROLES.includes(role)) {
    const baseUrl = normalizeBaseUrl(PARTNER_PORTAL_ORIGIN);
    const loginUrl = new URL('/login', `${baseUrl}/`);
    const portalPath = getPortalHomeRoute(role, fallbackPath);

    if (token) {
      loginUrl.searchParams.set('token', token);
    }

    loginUrl.searchParams.set('next', portalPath);

    return loginUrl.toString();
  }

  return fallbackPath || '/profile';
};
