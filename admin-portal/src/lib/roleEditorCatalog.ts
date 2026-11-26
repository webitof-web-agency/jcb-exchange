import {
  AI_PERMISSION_DEFINITIONS,
  CRM_PERMISSION_GROUPS,
  EMAIL_PERMISSION_DEFINITIONS,
  FINANCE_WORKSPACE_PERMISSION_GROUPS,
  HRM_PERMISSION_GROUPS,
  KYC_PERMISSION_DEFINITIONS,
  LISTING_PERMISSION_DEFINITIONS,
  type AdminPermissionGroupDefinition,
} from './adminPermissionCatalog';

/**
 * Every permission the role editor (Users > Roles) can tick, by section. Every key here must be in the backend
 * allow-list (backend/src/utils/adminPermissions.ts); roleEditorCatalog.test.ts checks both directions.
 */
export const ROLE_EDITOR_PERMISSION_DATA: Record<string, AdminPermissionGroupDefinition[]> = {
  'Users & Roles': [
    {
      groupName: 'Users',
      permissions: [
        { id: 'users.create', label: 'Create Users' },
        { id: 'users.read', label: 'View Users' },
        { id: 'users.update', label: 'Edit Users' },
        { id: 'users.delete', label: 'Delete Users' },
      ],
    },
    {
      groupName: 'Roles',
      permissions: [
        { id: 'roles.create', label: 'Create Roles' },
        { id: 'roles.read', label: 'View Roles' },
        { id: 'roles.update', label: 'Edit Roles' },
        { id: 'roles.delete', label: 'Delete Roles' },
      ],
    },
  ],
  'CRM & Enquiries': [
    {
      groupName: 'Enquiries (legacy)',
      permissions: [
        { id: 'enquiries.manage', label: 'Manage all enquiries (= CRM, every lead)' },
      ],
    },
    ...CRM_PERMISSION_GROUPS.map((group) => ({ groupName: `CRM: ${group.groupName}`, permissions: group.permissions })),
  ],
  'WhatsApp': [
    {
      groupName: 'WhatsApp Cloud API',
      permissions: [
        { id: 'whatsapp.read', label: 'View WhatsApp' },
        { id: 'whatsapp.manage', label: 'Manage WhatsApp Settings & Automations' },
      ],
    },
  ],
  'SMS Notifications': [
    {
      groupName: 'SMS Notifications',
      permissions: [
        { id: 'sms.read', label: 'View SMS Notifications' },
        { id: 'sms.manage', label: 'Manage SMS Settings & Automations' },
      ],
    },
  ],
  'Email Communications': [
    {
      groupName: 'Transactional Email',
      permissions: EMAIL_PERMISSION_DEFINITIONS,
    },
  ],
  'Artificial Intelligence': [
    {
      groupName: 'JCB Intelligence Hub & Provider',
      permissions: AI_PERMISSION_DEFINITIONS,
    },
  ],
  'Listings': [
    {
      groupName: 'Listings',
      permissions: LISTING_PERMISSION_DEFINITIONS,
    },
  ],
  'Accounts': [
    {
      groupName: 'RTO Work',
      permissions: [
        { id: 'accounts.rto.read', label: 'View RTO Work' },
        { id: 'accounts.rto.create', label: 'Add RTO Work' },
        { id: 'accounts.rto.update', label: 'Edit RTO Work' },
        { id: 'accounts.rto.delete', label: 'Delete RTO Work' },
        { id: 'accounts.rto.export', label: 'Export RTO Work' },
      ],
    },
    {
      groupName: 'Sold Vehicles',
      permissions: [
        { id: 'accounts.sell.read', label: 'View Sold Vehicles' },
        { id: 'accounts.sell.create', label: 'Add Sold Vehicles' },
        { id: 'accounts.sell.update', label: 'Edit Sold Vehicles' },
        { id: 'accounts.sell.delete', label: 'Delete Sold Vehicles' },
        { id: 'accounts.sell.export', label: 'Export Sold Vehicles' },
        { id: 'accounts.sell.refund.approve', label: 'Approve & Pay Sold Vehicle Refunds' },
      ],
    },
    {
      groupName: 'Transport & Delivery',
      permissions: [
        { id: 'accounts.transport.read', label: 'View Transport & Delivery' },
        { id: 'accounts.transport.crud', label: 'Manage Transport & Delivery (Full Operations)' },
        { id: 'accounts.transport.create', label: 'Add Transport Records' },
        { id: 'accounts.transport.update', label: 'Update Carrier & Status' },
        { id: 'accounts.transport.delete', label: 'Delete Transport Records' },
        { id: 'accounts.transport.export', label: 'Export Transport Records' },
      ],
    },
    {
      groupName: 'Tasks',
      permissions: [
        { id: 'tasks.read', label: 'View Tasks' },
      ],
    },
  ],
  'Finance': [
    {
      groupName: 'Expenses & Transactions',
      permissions: [
        { id: 'finance.read', label: 'View Expenses & Transactions' },
        { id: 'finance.manage', label: 'Manage Expenses & Transactions' },
      ],
    },
    ...FINANCE_WORKSPACE_PERMISSION_GROUPS.map((group) => ({
      groupName: `Finance Workspace: ${group.groupName}`,
      permissions: group.permissions,
    })),
  ],
  'Recruitment': [
    {
      groupName: 'Recruitment Dashboard',
      permissions: [
        { id: 'recruitment.dashboard.read', label: 'View Recruitment Dashboard' },
      ],
    },
    {
      groupName: 'Recruitment Access',
      permissions: [
        { id: 'recruitment.scope.all', label: 'All-India recruitment (untick for State Managers: they then see only their own states)' },
      ],
    },
    {
      groupName: 'Departments',
      permissions: [
        { id: 'recruitment.departments.read', label: 'View Departments' },
        { id: 'recruitment.departments.create', label: 'Create Departments' },
        { id: 'recruitment.departments.update', label: 'Edit Departments' },
        { id: 'recruitment.departments.delete', label: 'Delete Departments' },
      ],
    },
    {
      groupName: 'Jobs',
      permissions: [
        { id: 'recruitment.jobs.read', label: 'View Jobs' },
        { id: 'recruitment.jobs.create', label: 'Create Jobs' },
        { id: 'recruitment.jobs.update', label: 'Edit Jobs' },
        { id: 'recruitment.jobs.delete', label: 'Delete Jobs' },
        { id: 'recruitment.jobs.duplicate', label: 'Duplicate Jobs' },
        { id: 'recruitment.jobs.change_status', label: 'Change Job Status' },
      ],
    },
    {
      groupName: 'Applications',
      permissions: [
        { id: 'recruitment.applications.read', label: 'View Applications' },
        { id: 'recruitment.applications.update_stage', label: 'Change Application Stage' },
        { id: 'recruitment.applications.assign', label: 'Assign Applications' },
        { id: 'recruitment.applications.delete', label: 'Delete Applications' },
        { id: 'recruitment.applications.notes.create', label: 'Add Application Notes' },
        { id: 'recruitment.applications.notes.update', label: 'Edit Application Notes' },
        { id: 'recruitment.applications.notes.delete', label: 'Delete Application Notes' },
        { id: 'recruitment.applications.ratings.create', label: 'Add Candidate Ratings' },
        { id: 'recruitment.applications.ratings.update', label: 'Edit Candidate Ratings' },
        { id: 'recruitment.applications.ratings.delete', label: 'Delete Candidate Ratings' },
      ],
    },
    {
      groupName: 'Candidates',
      permissions: [
        { id: 'recruitment.candidates.read', label: 'View Candidates' },
        { id: 'recruitment.candidates.update', label: 'Edit Candidates & Talent Pool' },
      ],
    },
    {
      groupName: 'Interviews',
      permissions: [
        { id: 'recruitment.interviews.read', label: 'View Interviews' },
        { id: 'recruitment.interviews.create', label: 'Schedule Interviews' },
        { id: 'recruitment.interviews.update', label: 'Edit Interview Details' },
        { id: 'recruitment.interviews.delete', label: 'Delete Interviews' },
        { id: 'recruitment.interviews.scorecard', label: 'Manage Interview Scorecards' },
      ],
    },
    {
      groupName: 'Offers',
      permissions: [
        { id: 'recruitment.offers.read', label: 'View Offers' },
        { id: 'recruitment.offers.create', label: 'Create Offers' },
        { id: 'recruitment.offers.update', label: 'Edit Offers' },
        { id: 'recruitment.offers.delete', label: 'Delete Offers' },
        { id: 'recruitment.offers.change_status', label: 'Change Offer Status' },
      ],
    },
    {
      groupName: 'Pipeline Stages',
      permissions: [
        { id: 'recruitment.pipeline.read', label: 'View Pipeline Stages' },
        { id: 'recruitment.pipeline.create', label: 'Create Pipeline Stages' },
        { id: 'recruitment.pipeline.update', label: 'Edit Pipeline Stages' },
        { id: 'recruitment.pipeline.delete', label: 'Delete Pipeline Stages' },
      ],
    },
    {
      groupName: 'Recruitment Settings',
      permissions: [
        { id: 'recruitment.settings.read', label: 'View Recruitment Settings' },
        { id: 'recruitment.settings.update', label: 'Edit Recruitment Settings' },
      ],
    },
  ],
  'HRM': HRM_PERMISSION_GROUPS.map((group) => ({ ...group })),
  'Partners': [
    {
      groupName: 'Partners',
      permissions: [
        { id: 'partners.read', label: 'View Partners' },
        { id: 'partners.create', label: 'Add Partner' },
        { id: 'partners.update', label: 'Edit Partner' },
        { id: 'partners.reset_password', label: 'Reset Password' },
        { id: 'partners.change_status', label: 'Change Status' },
        { id: 'partners.delete', label: 'Delete Partner' },
      ],
    },
  ],
  'Visitors': [
    {
      groupName: 'Visitors',
      permissions: [
        { id: 'visitors.read', label: 'View Visitors' },
        { id: 'visitors.update', label: 'Edit Visitor' },
        { id: 'visitors.change_status', label: 'Change Status' },
        { id: 'visitors.delete', label: 'Delete Visitor' },
      ],
    },
  ],
  'Categories': [
    {
      groupName: 'Categories',
      permissions: [
        { id: 'categories.read', label: 'View Categories' },
        { id: 'categories.create', label: 'Create Category' },
        { id: 'categories.update', label: 'Edit Category' },
        { id: 'categories.delete', label: 'Delete Category' },
      ],
    },
  ],
  'Brands': [
    {
      groupName: 'Brands',
      permissions: [
        { id: 'brands.read', label: 'View Brands' },
        { id: 'brands.create', label: 'Create Brand' },
        { id: 'brands.update', label: 'Edit Brand' },
        { id: 'brands.delete', label: 'Delete Brand' },
      ],
    },
  ],
  'Verifications': [
    {
      groupName: 'Verifications',
      permissions: KYC_PERMISSION_DEFINITIONS,
    },
  ],
  'Identity Hub': [
    {
      groupName: 'Identity Hub',
      permissions: [
        { id: 'pan.verification.read', label: 'View PAN Verification' },
        { id: 'gst.verification.read', label: 'View GST Verification' },
        { id: 'aadhaar.digilocker.read', label: 'View Aadhaar DigiLocker Verification' },
      ],
    },
  ],
  'Vehicle & Transport': [
    {
      groupName: 'Vehicle & Transport',
      permissions: [
        { id: 'driving-license.verification.read', label: 'View Driving License Verification' },
        { id: 'rc.owner-history.read', label: 'View RC Owner History' },
        { id: 'rc.challan.verification.read', label: 'View RC Challan' },
        { id: 'rc.chassis-to-rc.read', label: 'View Chassis to RC Verification' },
        { id: 'rc.to-mobile.read', label: 'View RC to Mobile' },
      ],
    },
  ],
  'Recurrence': [
    {
      groupName: 'Recurrence',
      permissions: [
        { id: 'recurrence.manage', label: 'Manage Recurrence' },
      ],
    },
  ],
  'Settings': [
    {
      groupName: 'Settings',
      permissions: [
        { id: 'settings.manage', label: 'Manage Settings' },
      ],
    },
  ],
  'Translations': [
    {
      groupName: 'Translations',
      permissions: [
        { id: 'translations.manage', label: 'Manage Translations' },
      ],
    },
  ],
  'Footer': [
    {
      groupName: 'Footer',
      permissions: [
        { id: 'footer.manage', label: 'Manage Footer' },
      ],
    },
  ],
  'Partner Agreements': [
    {
      groupName: 'Partner Agreements',
      permissions: [
        { id: 'partner.agreements.read', label: 'View Partner Agreements' },
        { id: 'partner.agreements.manage', label: 'Manage Partner Agreements' },
      ],
    },
  ],
  'Dashboard': [
    {
      groupName: 'Dashboard',
      permissions: [
        { id: 'dashboard.view', label: 'View Dashboard Metrics' },
      ],
    },
  ],
  'Analytics': [
    {
      groupName: 'Analytics',
      permissions: [
        { id: 'analytics.read', label: 'View Advanced Analytics' },
      ],
    },
  ],
  'Blog': [
    {
      groupName: 'Blog',
      permissions: [
        { id: 'blog.read', label: 'View Blog Posts' },
        { id: 'blog.create', label: 'Create Blog Posts' },
        { id: 'blog.update', label: 'Edit Blog Posts' },
        { id: 'blog.delete', label: 'Delete Blog Posts' },
      ],
    },
  ],
};

export const ROLE_EDITOR_PERMISSION_IDS: string[] = Object.values(ROLE_EDITOR_PERMISSION_DATA)
  .flatMap((groups) => groups.flatMap((group) => group.permissions.map((permission) => permission.id)));

type PermissionHolder = { role?: string | null; permissions?: string[] | null } | null | undefined;

/** Super Admin and ALL_ACCESS hold every permission, so they may give any of them. */
export const holdsAllPermissions = (holder: PermissionHolder) =>
  holder?.role === 'SUPER_ADMIN' || Boolean(holder?.permissions?.includes('ALL_ACCESS'));

/**
 * Whether `holder` may give (tick or untick) `permission` on a role or a login. Mirrors the server rule
 * "nobody hands out more than they hold" (backend utils/permissionGrantRules.ts permissionsNotHeld).
 */
export const canGrantPermission = (holder: PermissionHolder, permission: string) =>
  holdsAllPermissions(holder) || Boolean(holder?.permissions?.includes(permission));

/** The permissions in `wanted` that `holder` does not hold (none for a Super Admin / ALL_ACCESS holder). */
export const permissionsNotHeldBy = (holder: PermissionHolder, wanted: Iterable<string>) =>
  [...new Set(wanted)].filter((permission) => !canGrantPermission(holder, permission));

/** A role can be given to a login only by somebody who holds every permission in it. */
export const canAssignRole = (holder: PermissionHolder, rolePermissions: string[] | null | undefined) =>
  permissionsNotHeldBy(holder, rolePermissions ?? []).length === 0;

/**
 * "Mark all" for one group: ticks (or, when every grantable key is already ticked, unticks) only the keys the holder
 * may give. Keys the holder does not hold keep their current state.
 */
export const toggleGrantableGroup = (selected: ReadonlySet<string>, groupPermissionIds: string[], holder: PermissionHolder) => {
  const grantable = groupPermissionIds.filter((permission) => canGrantPermission(holder, permission));
  const next = new Set(selected);
  if (!grantable.length) return next;
  const allTicked = grantable.every((permission) => next.has(permission));
  grantable.forEach((permission) => (allTicked ? next.delete(permission) : next.add(permission)));
  return next;
};

type ApiErrorShape = { response?: { data?: { error?: unknown; message?: unknown } } };

/** The server's own explanation (e.g. a 403 "would give access you do not have yourself"), else the fallback. */
export const serverErrorMessage = (error: unknown, fallback: string) => {
  const data = (error as ApiErrorShape)?.response?.data;
  const message = typeof data?.error === 'string' && data.error.trim()
    ? data.error
    : typeof data?.message === 'string' && data.message.trim() ? data.message : '';
  return message || fallback;
};
