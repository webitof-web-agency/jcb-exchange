import prisma from '../src/lib/prisma';

const unique = (...groups: string[][]) => Array.from(new Set(groups.flat()));

const users = ['users.create', 'users.read', 'users.update', 'users.delete'];
const roles = ['roles.create', 'roles.read', 'roles.update', 'roles.delete'];
const crm = [
  'enquiries.manage',
  'crm.read',
  'crm.manage',
  'crm.manage_all',
  'crm.pipeline.manage',
  'crm.assign',
  'crm.reports',
  'crm.export',
  'crm.import',
  'crm.campaigns',
];
const listings = [
  'listings.read',
  'listings.update',
  'listings.verification.bypass',
  'listings.approve',
  'listings.verify_payment',
  'listings.delete',
];
const partners = ['partners.read', 'partners.create', 'partners.update', 'partners.reset_password', 'partners.change_status', 'partners.delete'];
const visitors = ['visitors.read', 'visitors.update', 'visitors.change_status', 'visitors.delete'];
const categories = ['categories.read', 'categories.create', 'categories.update', 'categories.delete'];
const brands = ['brands.read', 'brands.create', 'brands.update', 'brands.delete'];
const identityHub = ['pan.verification.read', 'gst.verification.read', 'aadhaar.digilocker.read'];
const vehicleTransport = [
  'driving-license.verification.read',
  'rc.owner-history.read',
  'rc.challan.verification.read',
  'rc.chassis-to-rc.read',
  'rc.to-mobile.read',
];
const accounts = [
  'accounts.rto.read',
  'accounts.rto.crud',
  'accounts.rto.create',
  'accounts.rto.update',
  'accounts.rto.delete',
  'accounts.rto.export',
  'accounts.sell.read',
  'accounts.sell.crud',
  'accounts.sell.create',
  'accounts.sell.update',
  'accounts.sell.delete',
  'accounts.sell.export',
  'accounts.sell.refund.approve',
];
const recruitment = [
  'recruitment.dashboard.read',
  'recruitment.departments.read',
  'recruitment.departments.create',
  'recruitment.departments.update',
  'recruitment.departments.delete',
  'recruitment.jobs.read',
  'recruitment.jobs.create',
  'recruitment.jobs.update',
  'recruitment.jobs.delete',
  'recruitment.jobs.duplicate',
  'recruitment.jobs.change_status',
  'recruitment.applications.read',
  'recruitment.applications.update_stage',
  'recruitment.applications.assign',
  'recruitment.applications.delete',
  'recruitment.applications.notes.create',
  'recruitment.applications.notes.update',
  'recruitment.applications.notes.delete',
  'recruitment.applications.ratings.create',
  'recruitment.applications.ratings.update',
  'recruitment.applications.ratings.delete',
  'recruitment.interviews.read',
  'recruitment.interviews.create',
  'recruitment.interviews.update',
  'recruitment.interviews.delete',
  'recruitment.interviews.scorecard',
  'recruitment.offers.read',
  'recruitment.offers.create',
  'recruitment.offers.update',
  'recruitment.offers.delete',
  'recruitment.offers.change_status',
  'recruitment.pipeline.read',
  'recruitment.pipeline.create',
  'recruitment.pipeline.update',
  'recruitment.pipeline.delete',
  'recruitment.settings.read',
  'recruitment.settings.update',
];
const content = [
  ...categories,
  ...brands,
  'blog.read',
  'blog.create',
  'blog.update',
  'blog.delete',
  'footer.manage',
  'translations.manage',
];
const partnerAgreements = ['partner.agreements.read', 'partner.agreements.manage'];
const fullFinance = [
  'finance.read',
  'finance.manage',
  'fh.dashboard.read',
  'fh.purchases.read',
  'fh.purchases.manage',
  'fh.sales.read',
  'fh.sales.manage',
  'fh.vehicle.read',
  'fh.vehicle.manage',
  'fh.parties.read',
  'fh.parties.manage',
  'fh.arap.read',
  'fh.arap.manage',
  'fh.banking.read',
  'fh.banking.manage',
  'fh.banking.reconcile',
  'fh.books.read',
  'fh.books.manage',
  'fh.books.post',
  'fh.expenses.read',
  'fh.expenses.manage',
  'fh.payroll.read',
  'fh.payroll.manage',
  'fh.tax.read',
  'fh.tax.manage',
  'fh.reports.read',
  'fh.reports.export',
  'fh.ca.read',
  'fh.ca.manage',
  'fh.ca.query',
  'fh.import.manage',
  'fh.export',
  'fh.settings.manage',
  'fh.period.lock',
  'fh.approve',
];

const roleSpecs = [
  {
    name: 'Manager',
    description: 'Full operational and recruitment access. Finance and platform settings are excluded.',
    permissions: unique(
      ['dashboard.view', 'analytics.read', 'whatsapp.read', 'whatsapp.manage', 'sms.read', 'sms.manage', 'kyc.manage', 'kyc.edit.override', 'recurrence.manage', 'tasks.read'],
      users,
      roles,
      crm,
      listings,
      partners,
      visitors,
      content,
      partnerAgreements,
      identityHub,
      vehicleTransport,
      accounts,
      recruitment,
    ),
  },
  {
    name: 'CRE',
    description: 'Customer Relationship Executive access for CRM, listings, sold vehicles, RTO, tasks, identity, transport and visitors.',
    permissions: unique(['tasks.read'], crm, listings, visitors, identityHub, vehicleTransport, accounts),
  },
  {
    name: 'Accountant',
    description: 'Full Accounts, Finance Workspace, sold vehicle and RTO access.',
    permissions: unique([], accounts, fullFinance),
  },
  {
    name: 'CA',
    description: 'CA and audit access with taxation, reports and read-only supporting finance data.',
    permissions: unique(
      ['fh.dashboard.read', 'fh.reports.read', 'fh.reports.export', 'fh.export', 'fh.import.manage', 'fh.ca.read', 'fh.ca.manage', 'fh.ca.query', 'fh.approve', 'fh.tax.read', 'fh.tax.manage', 'fh.books.read', 'fh.banking.read', 'fh.purchases.read', 'fh.sales.read', 'fh.vehicle.read', 'fh.parties.read', 'fh.arap.read', 'fh.expenses.read', 'fh.payroll.read'],
    ),
  },
  {
    name: 'HR',
    description: 'Recruitment and HR management access only.',
    permissions: recruitment,
  },
  {
    name: 'SEO Manager',
    description: 'SEO content, taxonomy, publishing and analytics access only.',
    permissions: unique(['analytics.read'], content),
  },
] as const;

const findRole = async (name: string) => prisma.customRole.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });

async function main() {
  const roleIds = new Map<string, string>();
  for (const spec of roleSpecs) {
    const existing = await findRole(spec.name);
    const role = existing
      ? await prisma.customRole.update({ where: { id: existing.id }, data: { name: spec.name, description: spec.description, permissions: [...spec.permissions] } })
      : await prisma.customRole.create({ data: { name: spec.name, description: spec.description, permissions: [...spec.permissions] } });
    roleIds.set(spec.name, role.id);
  }

  const managerId = roleIds.get('Manager')!;
  const legacyManager = await prisma.customRole.findMany({ where: { name: { in: ['manager1', 'Manager1'] } }, select: { id: true } });
  if (legacyManager.length) {
    await prisma.user.updateMany({ where: { customRoleId: { in: legacyManager.map((role) => role.id) } }, data: { customRoleId: managerId } });
    await prisma.customRole.deleteMany({ where: { id: { in: legacyManager.map((role) => role.id).filter((id) => id !== managerId) } } });
  }

  const dummyRoles = await prisma.customRole.findMany({ where: { name: { in: ['dummy', 'Dummy', 'test', 'Test'] } }, select: { id: true, name: true } });
  const dummyIds = dummyRoles.map((role) => role.id);
  if (dummyIds.length) {
    const dummyUsers = await prisma.user.findMany({ where: { customRoleId: { in: dummyIds } }, select: { id: true } });
    if (dummyUsers.length) {
      await prisma.adminPermission.deleteMany({ where: { adminUserId: { in: dummyUsers.map((user) => user.id) } } });
      await prisma.user.updateMany({ where: { id: { in: dummyUsers.map((user) => user.id) } }, data: { customRoleId: null } });
    }
    await prisma.customRole.deleteMany({ where: { id: { in: dummyIds } } });
    console.log(`Removed ${dummyRoles.map((role) => role.name).join(', ')} role(s); detached ${dummyUsers.length} user(s) without deleting accounts.`);
  }

  console.log(`Synchronized ${roleSpecs.length} employee roles: ${roleSpecs.map((role) => role.name).join(', ')}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
