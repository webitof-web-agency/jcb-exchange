export type DashboardPortal = 'superadmin' | 'employee';

export type DashboardCardKey =
  | 'totalPartners'
  | 'approvedPartners'
  | 'pendingKyc'
  | 'activeListings'
  | 'totalEnquiries';

export interface DashboardCard {
  key: DashboardCardKey;
  hrefByPortal: {
    superadmin: string;
    employee: string;
  };
  requiredPermissions: string[];
  href?: string;
  isClickable: boolean;
}

export declare function getDashboardCards(input: {
  portal: DashboardPortal;
  userPermissions?: string[];
}): DashboardCard[];
