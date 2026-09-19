/**
 * @typedef {'superadmin' | 'employee'} DashboardPortal
 * @typedef {'totalPartners' | 'approvedPartners' | 'pendingKyc' | 'activeListings' | 'totalEnquiries'} DashboardCardKey
 *
 * @typedef {object} DashboardCardDefinition
 * @property {DashboardCardKey} key
 * @property {{ superadmin: string, employee: string }} hrefByPortal
 * @property {string[]} requiredPermissions
 *
 * @typedef {DashboardCardDefinition & {
 *   href?: string;
 *   isClickable: boolean;
 * }} DashboardCard
 */

const hasAnyPermission = (userPermissions = [], requiredPermissions = []) => {
  if (!requiredPermissions.length) {
    return true;
  }

  return userPermissions.includes('ALL_ACCESS') || requiredPermissions.some((permission) => userPermissions.includes(permission));
};

/** @type {DashboardCardDefinition[]} */
const dashboardCardDefinitions = [
  {
    key: 'totalPartners',
    hrefByPortal: {
      superadmin: '/superadmin/partners',
      employee: '/employee/partners',
    },
    requiredPermissions: ['partners.read'],
  },
  {
    key: 'approvedPartners',
    hrefByPortal: {
      superadmin: '/superadmin/partners',
      employee: '/employee/partners',
    },
    requiredPermissions: ['partners.read'],
  },
  {
    key: 'pendingKyc',
    hrefByPortal: {
      superadmin: '/superadmin/verifications',
      employee: '/employee/verifications',
    },
    requiredPermissions: ['kyc.manage'],
  },
  {
    key: 'activeListings',
    hrefByPortal: {
      superadmin: '/superadmin/listings',
      employee: '/employee/listings',
    },
    requiredPermissions: ['listings.read'],
  },
  {
    key: 'totalEnquiries',
    hrefByPortal: {
      superadmin: '/superadmin/enquiries',
      employee: '/employee/enquiries',
    },
    requiredPermissions: ['enquiries.manage'],
  },
];

/**
 * @param {{ portal: DashboardPortal, userPermissions?: string[] }} input
 * @returns {DashboardCard[]}
 */
export function getDashboardCards({ portal, userPermissions = [] }) {
  return dashboardCardDefinitions.map((definition) => {
    const href = definition.hrefByPortal[portal];
    const isClickable = portal === 'superadmin' || hasAnyPermission(userPermissions, definition.requiredPermissions);

    return {
      ...definition,
      href: isClickable ? href : undefined,
      isClickable,
    };
  });
}
