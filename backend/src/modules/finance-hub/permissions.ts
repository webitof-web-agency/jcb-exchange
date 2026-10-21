// Permission keys for the Financial Reports & CA Workspace (docs/finance-hub/00_MASTER_PLAN.md §4.3).
// The legacy finance.read / finance.manage keys keep controlling only the old Expenses page
// and deliberately do not grant any fh.* access (so nobody suddenly sees payroll).

export const FH_PERMISSIONS = {
  dashboardRead: 'fh.dashboard.read',
  purchasesRead: 'fh.purchases.read',
  purchasesManage: 'fh.purchases.manage',
  salesRead: 'fh.sales.read',
  salesManage: 'fh.sales.manage',
  vehicleRead: 'fh.vehicle.read',
  vehicleManage: 'fh.vehicle.manage',
  partiesRead: 'fh.parties.read',
  partiesManage: 'fh.parties.manage',
  arapRead: 'fh.arap.read',
  arapManage: 'fh.arap.manage',
  bankingRead: 'fh.banking.read',
  bankingManage: 'fh.banking.manage',
  bankingReconcile: 'fh.banking.reconcile',
  booksRead: 'fh.books.read',
  booksManage: 'fh.books.manage',
  booksPost: 'fh.books.post',
  expensesRead: 'fh.expenses.read',
  expensesManage: 'fh.expenses.manage',
  payrollRead: 'fh.payroll.read',
  payrollManage: 'fh.payroll.manage',
  taxRead: 'fh.tax.read',
  taxManage: 'fh.tax.manage',
  reportsRead: 'fh.reports.read',
  reportsExport: 'fh.reports.export',
  caRead: 'fh.ca.read',
  caManage: 'fh.ca.manage',
  caQuery: 'fh.ca.query',
  importManage: 'fh.import.manage',
  export: 'fh.export',
  settingsManage: 'fh.settings.manage',
  periodLock: 'fh.period.lock',
  approve: 'fh.approve',
} as const;

export type FinanceHubPermission = (typeof FH_PERMISSIONS)[keyof typeof FH_PERMISSIONS];

export const FH_ALL_PERMISSIONS: FinanceHubPermission[] = Object.values(FH_PERMISSIONS);

// Any finance-hub key opens the workspace shell; each page/API still checks its own keys.
export const FH_ANY_PERMISSIONS: FinanceHubPermission[] = FH_ALL_PERMISSIONS;
