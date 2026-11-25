import { EMAIL_VIEW_PERMISSIONS } from './adminPermissionCatalog';

export const employeeUsersPermissions = ['users.read', 'users.create', 'users.update', 'users.delete'];
export const employeeRolesPermissions = ['roles.read', 'roles.create', 'roles.update', 'roles.delete'];
export const employeeBrandsPermissions = ['brands.read', 'brands.create', 'brands.update', 'brands.delete'];
export const employeeFooterPermissions = ['footer.manage'];
export const employeePartnerAgreementPermissions = ['partner.agreements.read', 'partner.agreements.manage'];
export const employeeWhatsAppPermissions = ['whatsapp.read', 'whatsapp.manage'];
export const employeeSmsPermissions = ['sms.read', 'sms.manage'];
export const employeeEmailPermissions = EMAIL_VIEW_PERMISSIONS;
export const employeeBlogPermissions = ['blog.read', 'blog.create', 'blog.update', 'blog.delete'];

import { accountAnyPermissions } from './accountsPermissions';
import {
  getRecruitmentLandingPath,
  getRecruitmentRoutePermissions,
  recruitmentRoutePermissions,
} from './recruitmentPermissions';
import { getFirstHrmPath, getHrmPageKey, canOpenHrmPath, HRM_ANY_PAGE_PERMISSIONS } from './hrmAccess';
import { blogAnyPermissions } from './blogPermissions';
import { FINANCE_WORKSPACE_VIEW_PERMISSIONS } from './financeWorkspace';
import { CRM_READ_PERMISSIONS } from './adminPermissionCatalog';
import {
  IDENTITY_HUB_VIEW_PERMISSIONS,
  VEHICLE_TRANSPORT_VIEW_PERMISSIONS,
  DRIVING_LICENSE_VIEW_PERMISSIONS,
} from './featurePermissions';

export type EmployeeRoutePermission = {
  superadminPath: string;
  employeePath: string;
  /** Any of these opens the module. */
  permissions: string[];
  /** The module's first page these permissions open, when employeePath itself is not a page anyone can open. */
  landingPath?: (permissions: string[] | undefined) => string | null;
  /** A finer, per-page check inside the module (the module's own page map). */
  canOpenPath?: (employeePathname: string, permissions: string[] | undefined) => boolean;
};

/** An employee portal login (EMPLOYEE, or the legacy ADMIN role, which HRM checks the same way). */
const asEmployee = (permissions: string[] | undefined) => ({ role: 'EMPLOYEE', permissions: permissions ?? [] });

const recruitmentEntryPermissions = [...new Set(recruitmentRoutePermissions.flatMap((route) => route.permissions))];

export const employeeRoutePermissions: EmployeeRoutePermission[] = [
  {
    superadminPath: '/admin/dashboard',
    employeePath: '/employee/dashboard',
    permissions: ['dashboard.view'],
  },
  {
    // Each HRM page has its own permission (see hrmAccess.ts). Payroll is decided by the layout, which knows the role
    // (Finance Hub treats the ADMIN role as all-access).
    superadminPath: '/admin/hrm',
    employeePath: '/employee/hrm',
    permissions: HRM_ANY_PAGE_PERMISSIONS,
    landingPath: (permissions) => getFirstHrmPath(asEmployee(permissions), 'employee'),
    canOpenPath: (pathname, permissions) => getHrmPageKey(pathname) === 'payroll' || canOpenHrmPath(asEmployee(permissions), pathname),
  },
  {
    superadminPath: '/admin/verifications',
    employeePath: '/employee/verifications',
    permissions: ['kyc.manage'],
  },
  {
    superadminPath: '/admin/crm',
    employeePath: '/employee/crm',
    permissions: CRM_READ_PERMISSIONS,
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
    superadminPath: '/admin/email',
    employeePath: '/employee/email',
    permissions: employeeEmailPermissions,
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
    superadminPath: '/admin/finance/workspace',
    employeePath: '/employee/finance/workspace',
    permissions: FINANCE_WORKSPACE_VIEW_PERMISSIONS,
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
    // There is no /recruitment index page: land on the first recruitment page the permissions open.
    superadminPath: '/admin/recruitment',
    employeePath: '/employee/recruitment',
    permissions: recruitmentEntryPermissions,
    landingPath: (permissions) => getRecruitmentLandingPath(permissions, 'employee'),
    canOpenPath: (pathname, permissions) => hasAnyPermission(permissions, getRecruitmentRoutePermissions(pathname) ?? []),
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

/** The first page an employee login can open (an HR-only role lands in HRM, not on a dashboard that answers 403). */
export const getEmployeeLandingPath = (userPermissions: string[] | undefined) => {
  for (const route of employeeRoutePermissions) {
    if (!hasAnyPermission(userPermissions, route.permissions)) continue;
    const path = route.landingPath ? route.landingPath(userPermissions) : route.employeePath;
    if (path) return path;
  }
  return '/employee/dashboard';
};

const canOpenInModule = (route: EmployeeRoutePermission, employeePathname: string, userPermissions: string[] | undefined) =>
  hasAnyPermission(userPermissions, route.permissions) && (route.canOpenPath ? route.canOpenPath(employeePathname, userPermissions) : true);

export const resolveEmployeeRouteRedirect = (pathname: string, userPermissions: string[] | undefined) => {
  const matchedRoute = [...employeeRoutePermissions]
    .sort((a, b) => b.superadminPath.length - a.superadminPath.length)
    .find((route) => pathname === route.superadminPath || pathname.startsWith(`${route.superadminPath}/`));

  if (!matchedRoute) {
    return null;
  }

  const employeePathname = replaceRoutePrefix(pathname, matchedRoute.superadminPath, matchedRoute.employeePath) || matchedRoute.employeePath;
  if (canOpenInModule(matchedRoute, employeePathname, userPermissions)) {
    return employeePathname;
  }

  return getEmployeeLandingPath(userPermissions);
};

export const resolveEmployeePortalRoute = (pathname: string, userPermissions: string[] | undefined) => {
  const matchedRoute = [...employeeRoutePermissions]
    .sort((a, b) => b.employeePath.length - a.employeePath.length)
    .find((route) => pathname === route.employeePath || pathname.startsWith(`${route.employeePath}/`));

  if (matchedRoute && canOpenInModule(matchedRoute, pathname, userPermissions)) {
    // A module root without a page of its own (for example /employee/recruitment) opens its first allowed page.
    if (pathname === matchedRoute.employeePath && matchedRoute.landingPath) {
      return matchedRoute.landingPath(userPermissions) ?? getEmployeeLandingPath(userPermissions);
    }
    return pathname;
  }

  return getEmployeeLandingPath(userPermissions);
};
