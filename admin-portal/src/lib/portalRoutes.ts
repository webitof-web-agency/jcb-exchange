export const employeeUsersPermissions = ['users.read', 'users.create', 'users.update', 'users.delete'];
export const employeeRolesPermissions = ['roles.read', 'roles.create', 'roles.update', 'roles.delete'];
export const employeeBrandsPermissions = ['brands.read', 'brands.create', 'brands.update', 'brands.delete'];
export const employeeFooterPermissions = ['footer.manage'];
export const employeePartnerAgreementPermissions = ['partner.agreements.read', 'partner.agreements.manage'];
export const employeeWhatsAppPermissions = ['whatsapp.read', 'whatsapp.manage'];
export const employeeSmsPermissions = ['sms.read', 'sms.manage'];
export const employeeBlogPermissions = ['blog.read', 'blog.create', 'blog.update', 'blog.delete'];

import { accountAnyPermissions } from './accountsPermissions';
import {
  recruitmentAnyPermissions,
} from './recruitmentPermissions';
import { blogAnyPermissions } from './blogPermissions';
import {
  IDENTITY_HUB_VIEW_PERMISSIONS,
  VEHICLE_TRANSPORT_VIEW_PERMISSIONS,
  DRIVING_LICENSE_VIEW_PERMISSIONS,
} from './featurePermissions';

export type EmployeeRoutePermission = {
  superadminPath: string;
  employeePath: string;
  permissions: string[];
};

export const employeeRoutePermissions: EmployeeRoutePermission[] = [
  {
    superadminPath: '/superadmin/dashboard',
    employeePath: '/employee/dashboard',
    permissions: ['dashboard.view'],
  },
  {
    superadminPath: '/superadmin/verifications',
    employeePath: '/employee/verifications',
    permissions: ['kyc.manage'],
  },
  {
    superadminPath: '/superadmin/enquiries',
    employeePath: '/employee/enquiries',
    permissions: ['enquiries.manage'],
  },
  {
    superadminPath: '/superadmin/whatsapp',
    employeePath: '/employee/whatsapp',
    permissions: employeeWhatsAppPermissions,
  },
  {
    superadminPath: '/superadmin/sms',
    employeePath: '/employee/sms',
    permissions: employeeSmsPermissions,
  },
  {
    superadminPath: '/superadmin/listings',
    employeePath: '/employee/listings',
    permissions: ['listings.read'],
  },
  {
    superadminPath: '/superadmin/partners',
    employeePath: '/employee/partners',
    permissions: ['partners.read'],
  },
  {
    superadminPath: '/superadmin/visitors',
    employeePath: '/employee/visitors',
    permissions: ['visitors.read'],
  },
  {
    superadminPath: '/superadmin/categories',
    employeePath: '/employee/categories',
    permissions: ['categories.read', 'categories.create', 'categories.update', 'categories.delete'],
  },
  {
    superadminPath: '/superadmin/brands',
    employeePath: '/employee/brands',
    permissions: employeeBrandsPermissions,
  },
  {
    superadminPath: '/superadmin/recurrence',
    employeePath: '/employee/recurrence',
    permissions: ['recurrence.manage'],
  },
  {
    superadminPath: '/superadmin/accounts',
    employeePath: '/employee/accounts',
    permissions: accountAnyPermissions,
  },
  {
    superadminPath: '/superadmin/analytics',
    employeePath: '/employee/analytics',
    permissions: ['analytics.read'],
  },
  {
    superadminPath: '/superadmin/recruitment',
    employeePath: '/employee/recruitment',
    permissions: recruitmentAnyPermissions,
  },
  {
    superadminPath: '/superadmin/footer',
    employeePath: '/employee/footer',
    permissions: employeeFooterPermissions,
  },
  {
    superadminPath: '/superadmin/partner-agreements',
    employeePath: '/employee/partner-agreements',
    permissions: employeePartnerAgreementPermissions,
  },
  {
    superadminPath: '/superadmin/blogs',
    employeePath: '/employee/blogs',
    permissions: blogAnyPermissions,
  },
  {
    superadminPath: '/superadmin/translations',
    employeePath: '/employee/translations',
    permissions: ['translations.manage'],
  },
  {
    superadminPath: '/superadmin/users/roles',
    employeePath: '/employee/users/roles',
    permissions: employeeRolesPermissions,
  },
  {
    superadminPath: '/superadmin/users',
    employeePath: '/employee/users',
    permissions: employeeUsersPermissions,
  },
  {
    superadminPath: '/superadmin/settings',
    employeePath: '/employee/settings',
    permissions: ['settings.manage'],
  },
  {
    superadminPath: '/superadmin/identity-hub',
    employeePath: '/employee/identity-hub',
    permissions: IDENTITY_HUB_VIEW_PERMISSIONS,
  },
  {
    superadminPath: '/superadmin/driving-license-verification',
    employeePath: '/employee/driving-license-verification',
    permissions: DRIVING_LICENSE_VIEW_PERMISSIONS,
  },
  {
    superadminPath: '/superadmin/vehicle-transport',
    employeePath: '/employee/vehicle-transport',
    permissions: VEHICLE_TRANSPORT_VIEW_PERMISSIONS,
  },
];

export const hasAnyPermission = (userPermissions: string[] | undefined, requiredPermissions: string[]) => {
  if (!requiredPermissions.length) {
    return true;
  }

  if (!userPermissions?.length) {
    return false;
  }

  return userPermissions.includes('ALL_ACCESS') || requiredPermissions.some((permission) => userPermissions.includes(permission));
};

const replaceRoutePrefix = (pathname: string, sourcePrefix: string, targetPrefix: string) => {
  if (pathname === sourcePrefix) {
    return targetPrefix;
  }

  if (!pathname.startsWith(`${sourcePrefix}/`)) {
    return null;
  }

  return `${targetPrefix}${pathname.slice(sourcePrefix.length)}`;
};

export const getEmployeeLandingPath = (userPermissions: string[] | undefined) => {
  const firstAccessibleRoute = employeeRoutePermissions.find((route) => hasAnyPermission(userPermissions, route.permissions));
  return firstAccessibleRoute?.employeePath || '/employee/dashboard';
};

export const resolveEmployeeRouteRedirect = (pathname: string, userPermissions: string[] | undefined) => {
  const matchedRoute = [...employeeRoutePermissions]
    .sort((a, b) => b.superadminPath.length - a.superadminPath.length)
    .find((route) => pathname === route.superadminPath || pathname.startsWith(`${route.superadminPath}/`));

  if (!matchedRoute) {
    return null;
  }

  if (hasAnyPermission(userPermissions, matchedRoute.permissions)) {
    return replaceRoutePrefix(pathname, matchedRoute.superadminPath, matchedRoute.employeePath) || matchedRoute.employeePath;
  }

  return getEmployeeLandingPath(userPermissions);
};

export const resolveEmployeePortalRoute = (pathname: string, userPermissions: string[] | undefined) => {
  const matchedRoute = [...employeeRoutePermissions]
    .sort((a, b) => b.employeePath.length - a.employeePath.length)
    .find((route) => pathname === route.employeePath || pathname.startsWith(`${route.employeePath}/`));

  if (matchedRoute && hasAnyPermission(userPermissions, matchedRoute.permissions)) {
    return pathname;
  }

  return getEmployeeLandingPath(userPermissions);
};
