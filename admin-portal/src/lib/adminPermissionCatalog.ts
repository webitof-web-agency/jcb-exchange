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

export const EMAIL_PERMISSION_DEFINITIONS: AdminPermissionDefinition[] = [
  { id: 'email.read', label: 'View Email Communications' },
  { id: 'email.manage', label: 'Manage SMTP Settings & Email Delivery' },
];

export const EMAIL_VIEW_PERMISSIONS = ['email.read', 'email.manage'];
export const EMAIL_MANAGE_PERMISSIONS = ['email.manage'];

export const AI_PERMISSION_DEFINITIONS: AdminPermissionDefinition[] = [
  { id: 'ai.use', label: 'Use JCB Intelligence Hub' },
  { id: 'ai.manage', label: 'Manage Shared AI Provider Settings' },
  { id: 'ai.sensitive.read', label: 'View AI-sensitive fields (still masked to providers)' },
  { id: 'identity.sensitive.read', label: 'View identity-sensitive fields (still masked to providers)' },
];

export type AdminPermissionGroupDefinition = {
  groupName: string;
  /** Optional hint shown above the group in the role editor. */
  note?: string;
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

// Labels say what each key really unlocks on the server (backend/src/modules/hrm/routes.ts and services).
export const HRM_PERMISSION_GROUPS: AdminPermissionGroupDefinition[] = [
  {
    groupName: 'Employee master & organization',
    note: 'Almost every HRM page lists or opens employees, so an HRM role also needs "View HRM employees" (hrm.employees.read). '
      + 'Which employees it sees comes from its HRM access scope (or hrm.scope.all).',
    permissions: [
      { id: 'hrm.employees.read', label: 'View HRM employees' },
      { id: 'hrm.employees.manage', label: 'Employees: edit, deactivate, link login, reset password (with users.update)' },
      { id: 'hrm.org.read', label: 'View HRM organization' },
      { id: 'hrm.org.manage', label: 'Manage HRM organization (head-office masters need all-India access)' },
      { id: 'hrm.assignments.manage', label: 'Manage employment assignments' },
    ],
  },
  {
    groupName: 'Onboarding & documents',
    permissions: [
      { id: 'hrm.onboarding.read', label: 'View HRM onboarding' },
      {
        id: 'hrm.onboarding.manage',
        label: 'Onboarding: start, confirm joining, cancel, resolve review (Confirm joining also needs users.create / users.read / users.update for the login)',
      },
      { id: 'hrm.documents.read', label: 'View employee documents' },
      { id: 'hrm.documents.manage', label: 'Upload employee documents' },
      { id: 'hrm.documents.verify', label: 'Verify employee documents' },
    ],
  },
  {
    groupName: 'Attendance, leave & compensation',
    permissions: [
      { id: 'hrm.attendance.read', label: 'View attendance' },
      { id: 'hrm.attendance.manage', label: 'Manage attendance' },
      { id: 'hrm.leave.read', label: 'View leave' },
      { id: 'hrm.leave.manage', label: 'Manage leave requests' },
      { id: 'hrm.leave.approve', label: 'Approve leave' },
      { id: 'hrm.compensation.read', label: 'View salary history' },
      { id: 'hrm.compensation.manage', label: 'Manage salary history' },
      { id: 'hrm.compensation.approve', label: 'Approve / reject salaries (never your own)' },
    ],
  },
  {
    groupName: 'Performance, incentives & exit',
    permissions: [
      { id: 'hrm.performance.read', label: 'View performance' },
      { id: 'hrm.performance.manage', label: 'Manage performance' },
      { id: 'hrm.incentive.read', label: 'View incentives' },
      { id: 'hrm.incentive.manage', label: 'Manage incentives' },
      { id: 'hrm.exit.read', label: 'View exits' },
      { id: 'hrm.exit.manage', label: 'Manage exits' },
    ],
  },
  {
    groupName: 'Scope & audit',
    permissions: [
      { id: 'hrm.scope.manage', label: 'Give / end HRM access scopes (never wider than your own)' },
      { id: 'hrm.scope.all', label: 'All-India HRM access: every employee, give any access scope' },
      { id: 'hrm.audit.read', label: 'View HRM audit logs (all-India HR only)' },
    ],
  },
];
