export type AdminPermissionDefinition = {
  id: string;
  label: string;
};

export const LISTING_PERMISSION_DEFINITIONS: AdminPermissionDefinition[] = [
  { id: 'listings.read', label: 'View All Listings' },
  { id: 'listings.update', label: 'Edit Listing' },
  { id: 'listings.approve', label: 'Approve Listing' },
  { id: 'listings.verification.bypass', label: 'Bypass Vehicle Verification' },
  { id: 'listings.verify_payment', label: 'Payment Verification' },
  { id: 'listings.delete', label: 'Delete Listing' },
];

export const KYC_PERMISSION_DEFINITIONS: AdminPermissionDefinition[] = [
  { id: 'kyc.manage', label: 'Manage Verifications' },
  { id: 'kyc.edit.override', label: 'KYC Edit Override' },
];

export type AdminPermissionGroupDefinition = {
  groupName: string;
  permissions: AdminPermissionDefinition[];
};

// CRM & follow-ups. Mirrors backend/src/modules/crm/permissions.ts. The older
// enquiries.manage key still means "every enquiry" (same as crm.manage_all).
export const CRM_PERMISSION_GROUPS: AdminPermissionGroupDefinition[] = [
  {
    groupName: 'Leads & follow-ups',
    permissions: [
      { id: 'crm.read', label: 'View CRM (own leads)' },
      { id: 'crm.manage', label: 'Work own leads & follow-ups' },
      { id: 'crm.manage_all', label: 'See & work every lead' },
      { id: 'crm.pipeline.manage', label: 'Create & manage pipeline stages' },
      { id: 'crm.assign', label: 'Assign / reassign leads' },
    ],
  },
  {
    groupName: 'Reports, data & campaigns',
    permissions: [
      { id: 'crm.reports', label: 'View CRM reports' },
      { id: 'crm.export', label: 'Export leads' },
      { id: 'crm.import', label: 'Import leads (CSV)' },
      { id: 'crm.campaigns', label: 'Segments & WhatsApp campaigns' },
      { id: 'crm.settings', label: 'CRM settings & automation' },
    ],
  },
];

export const CRM_READ_PERMISSIONS = ['enquiries.manage', 'crm.read', 'crm.manage', 'crm.manage_all', 'crm.assign'];
export const CRM_VIEW_PERMISSIONS = ['enquiries.manage', ...CRM_PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => permission.id))];

// Financial Reports & CA Workspace. Mirrors backend/src/modules/finance-hub/permissions.ts.
// finance.read / finance.manage stay limited to the old Expenses page and grant none of these.
export const FINANCE_WORKSPACE_PERMISSION_GROUPS: AdminPermissionGroupDefinition[] = [
  {
    groupName: 'Workspace, Dashboard & Reports',
    permissions: [
      { id: 'fh.dashboard.read', label: 'View Finance Dashboard & Alerts' },
      { id: 'fh.reports.read', label: 'View Financial Reports' },
      { id: 'fh.reports.export', label: 'Export Financial Reports' },
      { id: 'fh.export', label: 'Export Finance Data' },
      { id: 'fh.import.manage', label: 'Import Finance Data' },
    ],
  },
  {
    groupName: 'Purchases, Sales & Vehicle Finance',
    permissions: [
      { id: 'fh.purchases.read', label: 'View Purchases' },
      { id: 'fh.purchases.manage', label: 'Manage Purchases' },
      { id: 'fh.sales.read', label: 'View Sales & Revenue' },
      { id: 'fh.sales.manage', label: 'Manage Sales & Revenue' },
      { id: 'fh.vehicle.read', label: 'View Vehicle Finance' },
      { id: 'fh.vehicle.manage', label: 'Manage Vehicle Finance' },
    ],
  },
  {
    groupName: 'Parties, Receivables & Payables',
    permissions: [
      { id: 'fh.parties.read', label: 'View Party Ledgers' },
      { id: 'fh.parties.manage', label: 'Manage Parties' },
      { id: 'fh.arap.read', label: 'View Receivables & Payables' },
      { id: 'fh.arap.manage', label: 'Manage Dues, Reminders & Write-offs' },
    ],
  },
  {
    groupName: 'Banking & Books',
    permissions: [
      { id: 'fh.banking.read', label: 'View Banking & Cash' },
      { id: 'fh.banking.manage', label: 'Manage Banking & Cash' },
      { id: 'fh.banking.reconcile', label: 'Reconcile Bank Statements' },
      { id: 'fh.books.read', label: 'View Books & Vouchers' },
      { id: 'fh.books.manage', label: 'Create & Edit Draft Vouchers' },
      { id: 'fh.books.post', label: 'Post Vouchers' },
    ],
  },
  {
    groupName: 'Expenses, Assets & Payroll',
    permissions: [
      { id: 'fh.expenses.read', label: 'View Expenses & Assets' },
      { id: 'fh.expenses.manage', label: 'Manage Expenses & Assets' },
      { id: 'fh.payroll.read', label: 'View Payroll' },
      { id: 'fh.payroll.manage', label: 'Manage Payroll' },
    ],
  },
  {
    groupName: 'Taxation & Compliance',
    permissions: [
      { id: 'fh.tax.read', label: 'View Taxation & Compliance' },
      { id: 'fh.tax.manage', label: 'Manage Taxation & Compliance' },
    ],
  },
  {
    groupName: 'CA Workspace, Approvals & Settings',
    permissions: [
      { id: 'fh.ca.read', label: 'View CA & Audit Workspace' },
      { id: 'fh.ca.manage', label: 'Manage Closing Checklists & Vault' },
      { id: 'fh.ca.query', label: 'Raise & Answer CA Queries' },
      { id: 'fh.approve', label: 'Approve Finance Entries' },
      { id: 'fh.period.lock', label: 'Close, Lock & Reopen Periods' },
      { id: 'fh.settings.manage', label: 'Manage Finance Settings' },
    ],
  },
];

export const FINANCE_WORKSPACE_PERMISSION_IDS = FINANCE_WORKSPACE_PERMISSION_GROUPS
  .flatMap((group) => group.permissions.map((permission) => permission.id));
