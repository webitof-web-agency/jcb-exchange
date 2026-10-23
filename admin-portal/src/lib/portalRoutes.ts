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
import { CRM_VIEW_PERMISSIONS } from './adminPermissionCatalog';
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
    superadminPath: '/admin/dashboard',
    employeePath: '/employee/dashboard',
    permissions: ['dashboard.view'],
  },
  {
    superadminPath: '/admin/verifications',
    employeePath: '/employee/verifications',
    permissions: ['kyc.manage'],
  },
  {
    superadminPath: '/admin/crm',
    employeePath: '/employee/crm',
    permissions: CRM_VIEW_PERMISSIONS,
  },
  {
    // Old enquiry links; the page redirects into the CRM.
    superadminPath: '/admin/enquiries',
    employeePath: '/employee/enquiries',
    permissions: ['enquiries.manage'],
  },
  {
    superadminPath: '/admin/whatsapp',
    employeePath: '/employee/whatsapp',
    permissions: employeeWhatsAppPermissions,
  },
  {
    superadminPath: '/admin/sms',
    employeePath: '/employee/sms',
    permissions: employeeSmsPermissions,
  },
  {
    superadminPath: '/admin/listings',
    employeePath: '/employee/listings',
    permissions: ['listings.read'],
  },
  {
    superadminPath: '/admin/partners',
    employeePath: '/employee/partners',
    permissions: ['partners.read'],
  },
  {
    superadminPath: '/admin/visitors',
    employeePath: '/employee/visitors',
    permissions: ['visitors.read'],
  },
  {
    superadminPath: '/admin/categories',
    employeePath: '/employee/categories',
    permissions: ['categories.read', 'categories.create', 'categories.update', 'categories.delete'],
  },
  {
    superadminPath: '/admin/brands',
    employeePath: '/employee/brands',
    permissions: employeeBrandsPermissions,
  },
  {
    superadminPath: '/admin/recurrence',
    employeePath: '/employee/recurrence',
    permissions: ['recurrence.manage'],
  },
  {
    superadminPath: '/admin/accounts',
    employeePath: '/employee/accounts',
    permissions: accountAnyPermissions,
  },
  {
    superadminPath: '/admin/tasks',
    employeePath: '/employee/tasks',
    permissions: ['tasks.read'],
  },
  {
    superadminPath: '/admin/analytics',
    employeePath: '/employee/analytics',
    permissions: ['analytics.read'],
  },
  {
    superadminPath: '/admin/recruitment',
    employeePath: '/employee/recruitment',
    permissions: recruitmentAnyPermissions,
  },
  {
    superadminPath: '/admin/footer',
    employeePath: '/employee/footer',
    permissions: employeeFooterPermissions,
  },
  {
    superadminPath: '/admin/partner-agreements',
    employeePath: '/employee/partner-agreements',
    permissions: employeePartnerAgreementPermissions,
  },
  {
    superadminPath: '/admin/blogs',
    employeePath: '/employee/blogs',
    permissions: blogAnyPermissions,
  },
  {
    superadminPath: '/admin/translations',
    employeePath: '/employee/translations',
    permissions: ['translations.manage'],
  },
  {
    superadminPath: '/admin/users/roles',
    employeePath: '/employee/users/roles',
    permissions: employeeRolesPermissions,
  },
  {
    superadminPath: '/admin/users',
    employeePath: '/employee/users',
    permissions: employeeUsersPermissions,
  },
  {
    superadminPath: '/admin/settings',
    employeePath: '/employee/settings',
    // crm.settings opens the page with only the CRM Settings section.
    permissions: ['settings.manage', 'crm.settings'],
  },
  {
    superadminPath: '/admin/identity-hub',
    employeePath: '/employee/identity-hub',
    permissions: IDENTITY_HUB_VIEW_PERMISSIONS,
  },
  {
    superadminPath: '/admin/driving-license-verification',
    employeePath: '/employee/driving-license-verification',
    permissions: DRIVING_LICENSE_VIEW_PERMISSIONS,
  },
  {
    superadminPath: '/admin/vehicle-transport',
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
