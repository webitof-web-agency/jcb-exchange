import { formatPartnerTypeLabel } from '@/lib/partnerType';

const PARTNER_PORTAL_ORIGIN =
  process.env.NEXT_PUBLIC_PARTNER_PORTAL_URL || 'http://localhost:3001';

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

export const PORTAL_ROLES = ['PARTNER', 'SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'];

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
      return isPrimeCustomer ? 'Prime Customer' : 'Customer';
    default:
      return 'Customer';
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

    if (token) {
      loginUrl.searchParams.set('token', token);
    }

    if (fallbackPath) {
      loginUrl.searchParams.set('next', fallbackPath);
    }

    return loginUrl.toString();
  }

  return fallbackPath || '/profile';
};
