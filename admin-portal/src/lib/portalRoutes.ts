export const employeeUsersPermissions = ['users.read', 'users.create', 'users.update', 'users.delete'];
export const employeeRolesPermissions = ['roles.read', 'roles.create', 'roles.update', 'roles.delete'];
export const employeeBrandsPermissions = ['brands.read', 'brands.create', 'brands.update', 'brands.delete'];
export const employeeFooterPermissions = ['footer.manage'];

export type EmployeeRoutePermission = {
  superadminPath: string;
  employeePath: string;
  permissions: string[];
};

export const employeeRoutePermissions: EmployeeRoutePermission[] = [
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
    superadminPath: '/superadmin/enquiries',
    employeePath: '/employee/enquiries',
    permissions: ['enquiries.manage'],
  },
  {
    superadminPath: '/superadmin/verifications',
    employeePath: '/employee/verifications',
    permissions: ['kyc.manage'],
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
    superadminPath: '/superadmin/listings',
    employeePath: '/employee/listings',
    permissions: ['listings.read'],
  },
  {
    superadminPath: '/superadmin/recurrence',
    employeePath: '/employee/recurrence',
    permissions: ['recurrence.manage'],
  },
  {
    superadminPath: '/superadmin/settings',
    employeePath: '/employee/settings',
    permissions: ['settings.manage'],
  },
  {
    superadminPath: '/superadmin/translations',
    employeePath: '/employee/translations',
    permissions: ['translations.manage'],
  },
  {
    superadminPath: '/superadmin/footer',
    employeePath: '/employee/footer',
    permissions: employeeFooterPermissions,
  },
  {
    superadminPath: '/superadmin/dashboard',
    employeePath: '/employee/dashboard',
    permissions: ['dashboard.view'],
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
