import { randomUUID } from 'node:crypto';
import { Prisma, type AuditEntityType } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { encryptSecret, secretsConfigured } from '../../finance-hub/utils/secrets';
import { assertDocumentAccess, assertEmployeeAccess, describeHrmReach, getEmployeeScopeWhere } from '../access';
import { writeHrmAudit } from '../audit';
import { findDesignationSpellings } from '../designations';
import { applyLoginIdentityChange, requireUsersUpdate } from './employeeLogin.service';
import { handOfferToHrm } from './offerHandoff.service';
import { abilitiesOf, assertCanGrant, checkScopeShape } from './joining.service';
import { syncOfficePrimaryManager } from '../officeAssignments';
import { normalizeProfileMobile } from '../../../utils/profileMobile';
import { HrmAuthorizationError, HrmConflictError, HrmHttpError, HrmNotFoundError } from '../errors';
import { buildPayrollReadiness } from '../payroll-readiness';
import { parseHrmInput, schemas } from '../validation';
import { istToday } from '../istDate';
import { assertEmployeeWritable, assertNotOwnRecord } from '../employeeGuards';
import { getActiveScopes, getEmployeeScopeEverWhere, getHrmPermissions } from '../access';
import { HRM_PERMISSIONS, hasAllIndiaScope, hasHrmPermission } from '../security';
import { caseScope, offerVisibleTo } from './onboarding.service';

type Actor = { userId: string; role: string; ipAddress?: string | null };

const dateOnly = (value?: string | null): Date | null => (
  value ? new Date(`${value}T00:00:00.000Z`) : null
);

const dateRequired = (value: string): Date => dateOnly(value)!;

const entity = (value: string) => value as AuditEntityType;

const audit = (actor: Actor, entityType: string, entityId: string, action: string, after?: unknown, before?: unknown, client?: any) => writeHrmAudit({
  actorUserId: actor.userId,
  entityType: entity(entityType),
  entityId,
  action,
  ...(before !== undefined ? { before } : {}),
  ...(after !== undefined ? { after } : {}),
  ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}),
}, client);

const employeeSelect = {
  id: true,
  employeeCode: true,
  userId: true,
  source: true,
  status: true,
  legalName: true,
  preferredName: true,
  workEmail: true,
  personalEmail: true,
  mobile: true,
  dateOfBirth: true,
  joinedOn: true,
  exitDate: true,
  gender: true,
  fatherOrSpouseName: true,
  maritalStatus: true,
  bloodGroup: true,
  currentAddress: true,
  permanentAddress: true,
  emergencyContact: true,
  /** Set when the record was archived (the person never joined): read-only from then on. */
  archivedAt: true,
  candidateId: true,
  applicationId: true,
  offerId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

const bankAccountSelect = {
  id: true,
  bankName: true,
  accountHolderName: true,
  maskedAccountNumber: true,
  ifsc: true,
  isPrimary: true,
  isVerified: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Fixed-length mask: it never reveals the account length and always fits the VarChar(20) column.
export const maskBankAccountNumber = (value: string) => `••••${value.slice(-4)}`;

/** Serialises concurrent writes for one key inside the current transaction (released on commit/rollback). */
const lockFor = (tx: { $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> }, key: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

const HRM_VIEWABLE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

/** Today in India as a DATE value (same as assignmentTimeline.utcToday). */
const utcToday = () => istToday();

/** The assignment that is in force today: ACTIVE, started, and not yet ended. */
const currentAssignmentWhere = () => {
  const today = utcToday();
  return {
    status: 'ACTIVE' as const,
    effectiveFrom: { lte: today },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
  };
};

const directorySort = {
  name: (order: 'asc' | 'desc') => [{ legalName: order }, { id: 'asc' as const }],
  code: (order: 'asc' | 'desc') => [{ employeeCode: order }, { id: 'asc' as const }],
  joinedOn: (order: 'asc' | 'desc') => [{ joinedOn: { sort: order, nulls: 'last' as const } }, { id: 'asc' as const }],
  status: (order: 'asc' | 'desc') => [{ status: order }, { legalName: 'asc' as const }, { id: 'asc' as const }],
  createdAt: (order: 'asc' | 'desc') => [{ createdAt: order }, { id: 'asc' as const }],
};

/**
 * Employee directory. Without `page` / `limit` it behaves as before (newest 200).
 * With them it is server-side paginated, sortable and filterable, and also returns the
 * per-status counts and the filter options that exist inside the caller's scope.
 */
export const listEmployees = async (actor: Actor, rawQuery: unknown) => {
  const query = parseHrmInput(schemas.listEmployeesQuery, rawQuery);
  const scopeWhere = await getEmployeeScopeWhere(actor);
  // Archived records (never joined) have only cancelled assignments: their scope is judged on any assignment they had.
  const archivedScopeWhere = await getEmployeeScopeEverWhere(actor);
  const listScope = query.archived === 'only' ? archivedScopeWhere : scopeWhere;
  const paged = query.page !== undefined || query.limit !== undefined;
  const limit = query.limit ?? 25;
  const page = query.page ?? 1;

  // The designation filter matches every spelling that differs only in case or spacing (see designations.ts).
  const designationSpellings = query.designation ? await findDesignationSpellings(query.designation) : [];
  const assignmentFilter = query.orgUnitId || query.designation || query.employmentType
    ? {
      assignments: {
        some: {
          ...currentAssignmentWhere(),
          ...(query.orgUnitId ? { orgUnitId: query.orgUnitId } : {}),
          ...(query.designation ? { designation: { in: designationSpellings.length ? designationSpellings : [query.designation] } } : {}),
          ...(query.employmentType ? { employmentType: query.employmentType } : {}),
        },
      },
    }
    : {};
  const kycComplete: Prisma.HrmEmployeeWhereInput = {
    AND: [
      { documents: { some: { provider: 'SUREPASS', status: 'VERIFIED', providerReference: { startsWith: 'PAN:' } } } },
      { documents: { some: { provider: 'SUREPASS', status: 'VERIFIED', providerReference: { startsWith: 'AADHAAR:' } } } },
      { bankAccounts: { some: {} } },
    ],
  };
  const kycFilter = query.kyc === 'complete' ? kycComplete : query.kyc === 'pending' ? { NOT: kycComplete } : {};
  const searchDigits = (query.search ?? '').replace(/\D/g, '');
  const baseWhere: Prisma.HrmEmployeeWhereInput = {
    // Records archived because the person never joined are kept (history): hidden unless asked for.
    archivedAt: query.archived === 'only' ? { not: null } : null,
    // Scope and the KYC filter are both AND conditions (each may use OR / AND inside).
    AND: [...(listScope ? [listScope] : []), ...(Object.keys(kycFilter).length ? [kycFilter] : [])],
    ...(query.search ? {
      OR: [
        { employeeCode: { contains: query.search, mode: 'insensitive' as const } },
        { legalName: { contains: query.search, mode: 'insensitive' as const } },
        { preferredName: { contains: query.search, mode: 'insensitive' as const } },
        { workEmail: { contains: query.search, mode: 'insensitive' as const } },
        { mobile: { contains: query.search } },
        // "98765 43210" or "98765-43210" should still find 9876543210.
        ...(searchDigits.length >= 6 && searchDigits !== query.search ? [{ mobile: { contains: searchDigits } }] : []),
      ],
    } : {}),
    ...assignmentFilter,
  };
  const where: Prisma.HrmEmployeeWhereInput = { ...baseWhere, ...(query.status ? { status: { in: query.status } } : {}) };

  const select = {
    ...employeeSelect,
    assignments: {
      where: currentAssignmentWhere(),
      orderBy: [{ effectiveFrom: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }],
      take: 1,
      select: {
        designation: true,
        employmentType: true,
        workMode: true,
        orgUnit: { select: { id: true, code: true, name: true, type: true } },
        isOfficeManager: true,
        officeUnit: { select: { id: true, name: true, type: true } },
        state: { select: { id: true, name: true } },
        city: { select: { id: true, name: true } },
        managerEmployee: { select: { id: true, employeeCode: true, legalName: true } },
      },
    },
    documents: { where: { provider: 'SUREPASS' as const, status: 'VERIFIED' as const }, select: { providerReference: true } },
    _count: { select: { bankAccounts: true } },
  };
  const orderBy = paged
    ? directorySort[query.sort ?? 'createdAt'](query.order ?? (query.sort === 'name' || query.sort === 'code' ? 'asc' : 'desc'))
    : [{ createdAt: 'desc' as const }];

  const [rows, total, statusGroups] = await Promise.all([
    prisma.hrmEmployee.findMany({
      where,
      select,
      orderBy,
      skip: paged ? (page - 1) * limit : 0,
      take: paged ? limit : 200,
    }),
    paged ? prisma.hrmEmployee.count({ where }) : Promise.resolve(0),
    // Tab counts are always for the records in the directory (not archived), whichever tab is open.
    paged ? prisma.hrmEmployee.groupBy({
      by: ['status'],
      where: { ...baseWhere, archivedAt: null, AND: [...(scopeWhere ? [scopeWhere] : []), ...(Object.keys(kycFilter).length ? [kycFilter] : [])] },
      _count: { _all: true },
    }) : Promise.resolve([]),
  ]);
  const archivedTotal = paged
    ? await prisma.hrmEmployee.count({ where: { archivedAt: { not: null }, ...(archivedScopeWhere ? { AND: [archivedScopeWhere] } : {}) } })
    : 0;

  // KYC summary per employee so the directory can show what is still missing for new joiners.
  const employees = rows.map(({ documents, _count, assignments, ...employee }) => ({
    ...employee,
    currentAssignment: assignments[0] ?? null,
    kyc: {
      pan: documents.some((document) => document.providerReference?.startsWith('PAN:')),
      aadhaar: documents.some((document) => document.providerReference?.startsWith('AADHAAR:')),
      bankAccounts: _count.bankAccounts,
    },
  }));
  if (!paged) return { employees };

  // Filter facets: the departments / designations of the people this caller may see.
  const facetWhere: Prisma.HrmEmploymentAssignmentWhereInput = { employee: { archivedAt: null, ...(scopeWhere ? { AND: [scopeWhere] } : {}) }, ...currentAssignmentWhere() };
  const [departmentGroups, designationGroups] = await Promise.all([
    prisma.hrmEmploymentAssignment.groupBy({ by: ['orgUnitId'], where: facetWhere }),
    prisma.hrmEmploymentAssignment.groupBy({ by: ['designation'], where: facetWhere }),
  ]);
  const departments = departmentGroups.length
    ? await prisma.hrmOrgUnit.findMany({
      where: { id: { in: departmentGroups.map((group) => group.orgUnitId) } },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    })
    : [];

  const counts: Record<string, number> = {};
  for (const group of statusGroups) counts[group.status] = group._count._all;
  return {
    employees,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    counts: { all: Object.values(counts).reduce((sum, value) => sum + value, 0), byStatus: counts },
    archivedTotal,
    // An empty list for somebody with no HR profile / no access scope is explained on the page.
    reach: await describeHrmReach(actor),
    facets: {
      departments,
      // The filter ignores case, so list each designation once.
      designations: [...new Map(designationGroups.map((group) => [group.designation.toLowerCase(), group.designation] as const)).values()].sort((a, b) => a.localeCompare(b)),
    },
  };
};

/**
 * Read-only cross-module check for the HRM -> Finance Hub payroll boundary.
 * HRM remains the employee/compensation master while Finance Hub remains the
 * payroll party/salary master; this method deliberately performs no writes.
 */
export const getPayrollReadiness = async (actor: Actor) => {
  const scopeWhere = await getEmployeeScopeWhere(actor);
  const employees = await prisma.hrmEmployee.findMany({
    where: { archivedAt: null, ...(scopeWhere ? { AND: [scopeWhere] } : {}) },
    select: { id: true, employeeCode: true, legalName: true, status: true, userId: true },
    orderBy: { employeeCode: 'asc' },
    take: 500,
  });
  const employeeIds = employees.map((employee) => employee.id);
  const userIds = employees.flatMap((employee) => employee.userId ? [employee.userId] : []);
  // DATE columns compare against today's date (a timestamp would drop the last day of every revision).
  const now = istToday();
  const [compensations, links] = await Promise.all([
    employeeIds.length
      ? prisma.hrmCompensationRevision.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        },
        select: { employeeId: true, status: true, effectiveFrom: true },
        orderBy: { effectiveFrom: 'desc' },
      })
      : [],
    userIds.length
      ? prisma.finPartyLink.findMany({ where: { linkType: 'USER', linkId: { in: userIds } }, select: { linkId: true, partyId: true } })
      : [],
  ]);
  const partyByUser = new Map(links.map((link) => [link.linkId, link.partyId]));
  const partyIds = [...new Set([...partyByUser.values()])];
  const salaries = partyIds.length
    ? await prisma.finEmployeeSalary.findMany({ where: { partyId: { in: partyIds } }, select: { partyId: true, isActive: true } })
    : [];
  const salaryByParty = new Map(salaries.map((salary) => [salary.partyId, salary]));
  const compensationByEmployee = new Map<string, (typeof compensations)[number]>();
  for (const compensation of compensations) {
    if (!compensationByEmployee.has(compensation.employeeId)) compensationByEmployee.set(compensation.employeeId, compensation);
  }

  return buildPayrollReadiness(employees.map((employee) => {
    const partyId = employee.userId ? partyByUser.get(employee.userId) : undefined;
    const salary = partyId ? salaryByParty.get(partyId) : undefined;
    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      legalName: employee.legalName,
      status: employee.status,
      userId: employee.userId,
      compensation: compensationByEmployee.get(employee.id) ?? null,
      finance: {
        partyLinked: Boolean(partyId),
        salaryProfile: Boolean(salary),
        salaryActive: salary?.isActive === true,
      },
    };
  }));
};

export const getEmployee = async (actor: Actor, employeeId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  // KYC documents (masked PAN / Aadhaar) and bank accounts are document data: they need a documents permission,
  // not just the right to see the profile.
  const permissions = await getHrmPermissions(actor.userId, actor.role);
  const documentsVisible = [HRM_PERMISSIONS.DOCUMENTS_READ, HRM_PERMISSIONS.DOCUMENTS_MANAGE, HRM_PERMISSIONS.DOCUMENTS_VERIFY].some((permission) => hasHrmPermission(permissions, permission));
  const found = await prisma.hrmEmployee.findUnique({
    where: { id: employeeId },
    select: {
      ...employeeSelect,
      assignments: {
        orderBy: { effectiveFrom: 'desc' },
        include: { orgUnit: true, officeUnit: { select: { id: true, name: true, type: true } }, operationalRegion: true, state: { select: { id: true, name: true } }, city: { select: { id: true, name: true } }, managerEmployee: { select: { id: true, employeeCode: true, legalName: true } } },
      },
      // The login account linked to this employee (never the password).
      // role: the portal shows reset-password / login edits only for EMPLOYEE logins (administrators use the Users screen).
      user: { select: { id: true, email: true, mobile: true, status: true, role: true, customRole: { select: { id: true, name: true } } } },
      documents: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, employeeId: true, category: true, title: true, mimeType: true, fileSize: true,
          provider: true, status: true, expiresAt: true, verifiedById: true, verifiedAt: true,
          rejectionReason: true, uploadedById: true, metadata: true, version: true, createdAt: true, updatedAt: true,
        },
      },
      bankAccounts: { select: bankAccountSelect, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }] },
    },
  });
  if (!found) throw new HrmNotFoundError('Employee not found.');
  const employee = documentsVisible ? { ...found, documentsVisible } : { ...found, documents: [], bankAccounts: [], documentsVisible };
  // For somebody who can sign in, the work email and mobile ARE the login's. The HR copy can lag behind (an offer-time
  // address, a number typed before the login was linked), so the profile always shows what the login really holds.
  if (employee.user) {
    return { ...employee, workEmail: employee.user.email, mobile: employee.user.mobile ?? employee.mobile };
  }
  return employee;
};

/** Personal-detail fields: JSON ones are cleared with DbNull, unsent ones are left alone. */
const PROFILE_KEYS = ['gender', 'fatherOrSpouseName', 'maritalStatus', 'bloodGroup', 'currentAddress', 'permanentAddress', 'emergencyContact'] as const;
const PROFILE_JSON_KEYS = new Set<string>(['currentAddress', 'permanentAddress', 'emergencyContact']);
const profileData = (input: object) => {
  const data: Record<string, unknown> = {};
  for (const key of PROFILE_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (value === undefined) continue;
    data[key] = value === null ? (PROFILE_JSON_KEYS.has(key) ? Prisma.DbNull : null) : value;
  }
  return data;
};
const withoutProfile = <T extends object>(input: T) =>
  Object.fromEntries(Object.entries(input).filter(([key]) => !(PROFILE_KEYS as readonly string[]).includes(key))) as Omit<T, (typeof PROFILE_KEYS)[number]>;

// The old free-form create (any employee code, any login) is retired: employees are added with Add employee
// (employeeOnboarding.service.ts) or from an accepted offer (offerHandoff.service.ts). POST /employees answers 410.

export const updateEmployee = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.updateEmployee, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  const before = await prisma.hrmEmployee.findUnique({ where: { id: employeeId }, select: employeeSelect });
  if (!before) throw new HrmNotFoundError('Employee not found.');
  if (before.archivedAt) throw new HrmHttpError(409, 'EMPLOYEE_ARCHIVED', 'This record was archived (the person never joined), so it cannot be edited.');
  const { version, ...changes } = input;

  // On your own record only your personal details (address, emergency contact...) are yours to change; the
  // HR-controlled fields (dates, status, employment, contact used for the login) are changed by somebody else.
  const hrControlled = Object.entries(changes).filter(([key, value]) => value !== undefined && !(PROFILE_KEYS as readonly string[]).includes(key));
  if (hrControlled.length) await assertNotOwnRecord(actor, employeeId, 'Changing your HR details');

  // A login is attached with "Link existing login", and leaving / pausing / re-opening a person goes through
  // Deactivate / Reactivate: those keep the login, reporting lines and assignments in step. Editing the profile may not skip them.
  if (changes.userId !== undefined && (changes.userId ?? null) !== (before.userId ?? null)) {
    throw new HrmHttpError(400, 'USE_LINK_LOGIN', 'A login is attached with “Link existing login”, not by editing the profile.');
  }
  const lifecycleStatuses = new Set(['SUSPENDED', 'EXITED', 'TERMINATED']);
  if (changes.status !== undefined && changes.status !== before.status && (lifecycleStatuses.has(changes.status) || lifecycleStatuses.has(before.status))) {
    throw new HrmHttpError(400, 'USE_LIFECYCLE', 'Suspending, exiting and reactivating go through Deactivate / Reactivate, so the login, reporting lines and assignments stay in step.');
  }
  // Only working statuses are edited here; joining one goes through Confirm joining / Cancel joining (login, checklist,
  // onboarding case and the recruitment application stay in step).
  const EDITABLE_STATUSES = new Set(['ACTIVE', 'ON_LEAVE', 'NOTICE_PERIOD']);
  if (changes.status !== undefined && changes.status !== before.status && (!EDITABLE_STATUSES.has(changes.status) || !EDITABLE_STATUSES.has(before.status))) {
    throw new HrmHttpError(400, 'USE_CONFIRM_JOINING', 'A joining is completed with "Confirm joining" (or stopped with "Cancel joining"); the status cannot be changed here.');
  }

  // The work email and mobile of somebody who can sign in ARE their login's email and mobile.
  // A value counts as an edit only when it differs from what the LOGIN holds (the HR copy may be out of step).
  const login = before.userId ? await prisma.user.findUnique({ where: { id: before.userId }, select: { email: true, mobile: true } }) : null;
  const hasLogin = Boolean(login);
  const emailEdit = hasLogin && changes.workEmail !== undefined && (changes.workEmail ?? '').trim().toLowerCase() !== (login?.email ?? '').trim().toLowerCase();
  const mobileEdit = hasLogin && changes.mobile !== undefined && (normalizeProfileMobile(changes.mobile) ?? '') !== (normalizeProfileMobile(login?.mobile) ?? '');
  if (emailEdit || mobileEdit) await requireUsersUpdate(actor, 'Changing the work email or mobile of an employee who has a login');

  const employee = await prisma.$transaction(async (tx) => {
    const identity = emailEdit || mobileEdit
      ? await applyLoginIdentityChange(tx, before.userId!, { email: emailEdit ? changes.workEmail : undefined, mobile: mobileEdit ? changes.mobile : undefined })
      : null;
    const result = await tx.hrmEmployee.updateMany({
      where: { id: employeeId, version },
      data: {
        ...withoutProfile(changes),
        ...profileData(changes),
        ...(changes.dateOfBirth !== undefined ? { dateOfBirth: dateOnly(changes.dateOfBirth) } : {}),
        ...(changes.joinedOn !== undefined ? { joinedOn: dateOnly(changes.joinedOn) } : {}),
        ...(changes.preferredName !== undefined ? { preferredName: changes.preferredName ?? null } : {}),
        ...(changes.workEmail !== undefined ? { workEmail: changes.workEmail ?? null } : {}),
        ...(changes.personalEmail !== undefined ? { personalEmail: changes.personalEmail ?? null } : {}),
        ...(changes.mobile !== undefined ? { mobile: changes.mobile ?? null } : {}),
        ...(changes.userId !== undefined ? { userId: changes.userId ?? null } : {}),
        // What the login stored (normalised) is what the HR record shows.
        ...(identity && emailEdit ? { workEmail: identity.email } : {}),
        ...(identity && mobileEdit ? { mobile: identity.mobile } : {}),
        version: { increment: 1 },
      } as any,
    });
    // A stale version rolls the login change back with it.
    if (result.count !== 1) throw new HrmConflictError('Employee was changed by another request. Refresh and retry.');
    // A status change can make a State Manager count (or stop counting) as their office's manager.
    if (changes.status !== undefined && changes.status !== before.status) {
      const managed = await tx.hrmEmploymentAssignment.findMany({ where: { employeeId, isOfficeManager: true, status: 'ACTIVE', officeUnitId: { not: null } }, select: { officeUnitId: true } });
      for (const officeUnitId of new Set(managed.map((row) => row.officeUnitId!))) await syncOfficePrimaryManager(tx, officeUnitId);
    }
    return tx.hrmEmployee.findUnique({ where: { id: employeeId }, select: employeeSelect });
  });
  await audit(actor, 'HRM_EMPLOYEE', employeeId, 'UPDATED', employee, before);
  return employee;
};

export const listOrgUnits = async (actor: Actor) => prisma.hrmOrgUnit.findMany({
  ...(actor.role === 'SUPER_ADMIN' ? {} : { where: { isActive: true } }),
  include: { parent: { select: { id: true, code: true, name: true } }, managerEmployee: { select: { id: true, employeeCode: true, legalName: true } } },
  orderBy: [{ type: 'asc' }, { name: 'asc' }],
});

export const createOrgUnit = async (actor: Actor, rawInput: unknown) => {
  const data = parseHrmInput(schemas.createOrgUnit, rawInput);
  // Departments, head offices and state offices go through the Organisation service, which generates the code and
  // enforces the duplicate, parent and one-office-per-state rules. This endpoint stays for the other unit types.
  if (data.type === 'DEPARTMENT' || data.type === 'HEAD_OFFICE' || (data.type === 'REGION' && data.stateId)) {
    throw new HrmHttpError(400, 'USE_ORGANISATION_PAGE', 'Add departments, the head office and state offices from the Organisation page.');
  }
  const orgUnit = await prisma.hrmOrgUnit.create({
    data: {
      code: data.code,
      name: data.name,
      type: data.type,
      parentId: data.parentId ?? null,
      stateId: data.stateId ?? null,
      cityId: data.cityId ?? null,
      managerEmployeeId: data.managerEmployeeId ?? null,
      createdById: actor.userId,
    },
  });
  await audit(actor, 'HRM_ORG_UNIT', orgUnit.id, 'CREATED', orgUnit);
  return orgUnit;
};

/**
 * HR starts (or re-runs) the HRM handoff of an accepted offer: the same system step that runs right after the
 * acceptance (see offerHandoff.service.ts). Running it again for the same offer changes nothing.
 */
export const createOnboardingFromOffer = async (actor: Actor, offerId: string, rawInput: unknown) => {
  parseHrmInput(schemas.onboardingFromOffer, rawInput ?? {});
  if (!(await offerVisibleTo(actor, offerId))) throw new HrmAuthorizationError('This offer is outside your HRM access scope.');
  const result = await handOfferToHrm(offerId);
  return prisma.hrmOnboardingCase.findUnique({
    where: { id: result.caseId },
    include: { employee: { select: { id: true, employeeCode: true, legalName: true, preferredName: true, status: true } } },
  });
};

export const listOnboarding = async (actor: Actor) => {
  const scope = await caseScope(actor);
  return prisma.hrmOnboardingCase.findMany({
    ...(scope ? { where: scope } : {}),
    omit: { rehireSnapshot: true },
    include: { employee: { select: { id: true, employeeCode: true, legalName: true, preferredName: true, status: true, joinedOn: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });
};

export const addDocument = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.createDocument, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertEmployeeWritable(employeeId);
  const document = await prisma.hrmEmployeeDocument.create({
    data: {
      category: input.category,
      title: input.title,
      fileRef: input.fileRef,
      // A typed reference is only a note: it never points at a stored file (uploads go through uploadEmployeeDocument).
      driveFileId: null,
      mimeType: input.mimeType ?? null,
      fileSize: input.fileSize ?? null,
      provider: 'MANUAL',
      providerReference: null,
      expiresAt: dateOnly(input.expiresAt),
      employeeId,
      uploadedById: actor.userId,
      status: 'PENDING',
    },
    select: {
      id: true, employeeId: true, category: true, title: true, mimeType: true, fileSize: true,
      provider: true, status: true, expiresAt: true, uploadedById: true, version: true, createdAt: true, updatedAt: true,
    },
  });
  await audit(actor, 'HRM_DOCUMENT', document.id, 'UPLOADED', document);
  return document;
};

/**
 * Stores only a masked verification summary and reference to a template already
 * secured by the shared Identity Hub. The provider's raw source response is
 * deliberately never copied into HRM.
 */
export const linkKycVerification = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.linkKycVerification, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertEmployeeWritable(employeeId);
  await assertNotOwnRecord(actor, employeeId, 'Linking KYC');

  const templateSelect = { select: { id: true, driveFileId: true, mimeType: true, fileSize: true } } as const;
  let record: {
    id: string;
    status: string;
    requestedById: string;
    completedAt: Date | null;
    maskedIdentifier: string;
    template: { id: string; driveFileId: string; mimeType: string; fileSize: number } | null;
  } | null = null;
  if (input.documentType === 'PAN') {
    const pan = await prisma.panVerificationRecord.findUnique({
      where: { id: input.verificationRecordId },
      select: { id: true, status: true, maskedPan: true, requestedById: true, completedAt: true, template: templateSelect },
    });
    record = pan ? { ...pan, maskedIdentifier: pan.maskedPan } : null;
  } else {
    const aadhaar = await prisma.aadhaarVerificationRecord.findUnique({
      where: { id: input.verificationRecordId },
      select: { id: true, status: true, maskedAadhaar: true, requestedById: true, completedAt: true, template: templateSelect },
    });
    record = aadhaar ? { ...aadhaar, maskedIdentifier: aadhaar.maskedAadhaar } : null;
  }

  // Only the staff member who ran the verification may attach it to an employee.
  if (!record || record.requestedById !== actor.userId) {
    throw new HrmHttpError(404, 'KYC_VERIFICATION_NOT_FOUND', 'The selected verification record is not available.');
  }
  if (record.status !== 'SUCCESS' || !record.template) {
    throw new HrmHttpError(409, 'KYC_TEMPLATE_REQUIRED', 'Generate and save the verified template before linking it to the employee.');
  }
  const template = record.template;

  const documentSelect = { id: true, employeeId: true, category: true, title: true, status: true, provider: true, metadata: true, verifiedAt: true, createdAt: true } as const;
  const providerReference = `${input.documentType}:${record.id}`;
  const verifiedRecord = record;
  const result = await prisma.$transaction(async (tx) => {
    // One verification record belongs to one employee; serialise concurrent links of it.
    await lockFor(tx, `hrm-kyc:${providerReference}`);
    const linkedElsewhere = await tx.hrmEmployeeDocument.findFirst({
      where: { provider: 'SUREPASS', providerReference, employeeId: { not: employeeId }, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });
    if (linkedElsewhere) {
      throw new HrmHttpError(409, 'KYC_VERIFICATION_ALREADY_LINKED', 'This verification is already linked to another employee. Run a fresh verification.');
    }
    const archiveOthers = (keepId?: string) => tx.hrmEmployeeDocument.updateMany({
      where: {
        employeeId, provider: 'SUREPASS', providerReference: { startsWith: `${input.documentType}:` }, status: 'VERIFIED',
        ...(keepId ? { NOT: { id: keepId } } : {}),
      },
      data: { status: 'ARCHIVED', version: { increment: 1 } },
    });

    const existing = await tx.hrmEmployeeDocument.findFirst({
      where: { employeeId, provider: 'SUREPASS', providerReference },
      select: documentSelect,
    });
    if (existing?.status === 'VERIFIED') return { document: existing, created: false };
    if (existing) {
      // Re-linking an older verification makes it the active one again.
      await archiveOthers(existing.id);
      const reactivated = await tx.hrmEmployeeDocument.update({
        where: { id: existing.id },
        data: { status: 'VERIFIED', version: { increment: 1 } },
        select: documentSelect,
      });
      return { document: reactivated, created: true };
    }

    // A newly linked PAN / Aadhaar replaces the previous one of the same type for this employee.
    await archiveOthers();
    const created = await tx.hrmEmployeeDocument.create({
      data: {
        employeeId,
        category: input.documentType === 'PAN' ? 'TAX' : 'IDENTITY',
        title: input.documentType === 'PAN' ? 'PAN card (verified)' : 'Aadhaar card (verified)',
        fileRef: `surepass-template:${input.documentType.toLowerCase()}:${template.id}`,
        driveFileId: template.driveFileId,
        mimeType: template.mimeType,
        fileSize: template.fileSize,
        provider: 'SUREPASS',
        providerReference,
        status: 'VERIFIED',
        verifiedById: actor.userId,
        verifiedAt: verifiedRecord.completedAt ?? new Date(),
        uploadedById: actor.userId,
        metadata: { documentType: input.documentType, maskedIdentifier: verifiedRecord.maskedIdentifier, verificationRecordId: verifiedRecord.id, templateId: template.id },
      },
      select: documentSelect,
    });
    return { document: created, created: true };
  });
  if (result.created) await audit(actor, 'HRM_DOCUMENT', result.document.id, 'KYC_LINKED', result.document);
  return result.document;
};

export const createBankAccount = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.createBankAccount, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertEmployeeWritable(employeeId);
  // Your own salary account is changed by somebody else (a classic payroll fraud path otherwise).
  await assertNotOwnRecord(actor, employeeId, 'Changing a bank account');
  if (!secretsConfigured()) {
    throw new HrmHttpError(503, 'BANK_ENCRYPTION_UNAVAILABLE', 'Bank-detail encryption is not configured. Contact a system administrator.');
  }

  const account = await prisma.$transaction(async (tx) => {
    await lockFor(tx, `hrm-bank:${employeeId}`);
    const existingCount = await tx.hrmEmployeeBankAccount.count({ where: { employeeId } });
    // The first account is always the salary account, whatever the client sent.
    const isPrimary = existingCount === 0 ? true : (input.isPrimary ?? false);
    if (isPrimary) await tx.hrmEmployeeBankAccount.updateMany({ where: { employeeId, isPrimary: true }, data: { isPrimary: false } });
    return tx.hrmEmployeeBankAccount.create({
      data: {
        employeeId,
        bankName: input.bankName ?? null,
        accountHolderName: input.accountHolderName ?? null,
        encryptedAccountNumber: encryptSecret(input.accountNumber),
        maskedAccountNumber: maskBankAccountNumber(input.accountNumber),
        ifsc: input.ifsc ?? null,
        isPrimary,
      },
      select: bankAccountSelect,
    });
  });
  await audit(actor, 'HRM_EMPLOYEE', employeeId, 'BANK_ACCOUNT_ADDED', account);
  return account;
};

const findEmployeeBankAccount = async (employeeId: string, accountId: string) => {
  const account = await prisma.hrmEmployeeBankAccount.findFirst({ where: { id: accountId, employeeId }, select: bankAccountSelect });
  if (!account) throw new HrmNotFoundError('Bank account not found for this employee.');
  return account;
};

/** Makes one account the salary (primary) account; every other account of the employee stops being primary. */
export const setPrimaryBankAccount = async (actor: Actor, employeeId: string, accountId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertEmployeeWritable(employeeId);
  await assertNotOwnRecord(actor, employeeId, 'Changing a bank account');
  const before = await findEmployeeBankAccount(employeeId, accountId);
  const account = await prisma.$transaction(async (tx) => {
    await lockFor(tx, `hrm-bank:${employeeId}`);
    await tx.hrmEmployeeBankAccount.updateMany({ where: { employeeId, isPrimary: true, NOT: { id: accountId } }, data: { isPrimary: false } });
    return tx.hrmEmployeeBankAccount.update({ where: { id: accountId }, data: { isPrimary: true }, select: bankAccountSelect });
  });
  await audit(actor, 'HRM_EMPLOYEE', employeeId, 'BANK_ACCOUNT_SET_PRIMARY', account, before);
  return account;
};

/** Removes a bank account. When the primary account is removed, the newest remaining account becomes primary. */
export const removeBankAccount = async (actor: Actor, employeeId: string, accountId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertEmployeeWritable(employeeId);
  await assertNotOwnRecord(actor, employeeId, 'Changing a bank account');
  const before = await findEmployeeBankAccount(employeeId, accountId);
  await prisma.$transaction(async (tx) => {
    await lockFor(tx, `hrm-bank:${employeeId}`);
    await tx.hrmEmployeeBankAccount.delete({ where: { id: accountId } });
    if (before.isPrimary) {
      const next = await tx.hrmEmployeeBankAccount.findFirst({ where: { employeeId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      if (next) await tx.hrmEmployeeBankAccount.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  });
  await audit(actor, 'HRM_EMPLOYEE', employeeId, 'BANK_ACCOUNT_REMOVED', undefined, before);
  return { removed: true, id: accountId };
};

/** File details for viewing a document stored on Google Drive (for example a verified PAN / Aadhaar template). */
export const getDocumentFile = async (actor: Actor, documentId: string) => {
  await assertDocumentAccess({ ...actor, documentId });
  const document = await prisma.hrmEmployeeDocument.findUnique({
    where: { id: documentId },
    select: { id: true, title: true, driveFileId: true, provider: true, providerReference: true, mimeType: true, metadata: true },
  });
  if (!document?.driveFileId) throw new HrmNotFoundError('This document has no stored file to view.');

  // Files the server stored itself (an HR upload, or the offer letter / certificate / signed copy from recruitment).
  // Manual documents are always MANUAL (see addDocument), so a client can never point this at another file.
  if (document.provider === 'GOOGLE_DRIVE') {
    // Only files the server wrote: an HR upload or the recruitment offer documents.
    const source = (document.metadata as { source?: unknown } | null)?.source;
    if (source !== 'HRM_UPLOAD' && source !== 'RECRUITMENT_OFFER') throw new HrmNotFoundError('This document has no stored file to view.');
    const mimeType = document.mimeType ?? '';
    if (!HRM_VIEWABLE_MIME_TYPES.has(mimeType)) throw new HrmNotFoundError('This document has no stored file to view.');
    const extension = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
    return {
      driveFileId: document.driveFileId,
      mimeType,
      fileName: `${document.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document'}.${extension}`,
    };
  }


  // Only stream files the server wrote itself: the Drive id must belong to the
  // verified PAN / Aadhaar template behind this document. Client-supplied Drive
  // ids on manual documents are never streamed.
  const [documentType, recordId] = (document.providerReference ?? '').split(':');
  const template = document.provider !== 'SUREPASS' || !recordId
    ? null
    : documentType === 'PAN'
      ? await prisma.panVerificationTemplate.findFirst({ where: { verificationRecordId: recordId, driveFileId: document.driveFileId }, select: { mimeType: true } })
      : documentType === 'AADHAAR'
        ? await prisma.aadhaarVerificationTemplate.findFirst({ where: { verificationRecordId: recordId, driveFileId: document.driveFileId }, select: { mimeType: true } })
        : null;
  if (!template || !HRM_VIEWABLE_MIME_TYPES.has(template.mimeType)) {
    throw new HrmNotFoundError('This document has no stored file to view.');
  }
  const extension = template.mimeType === 'application/pdf' ? 'pdf' : template.mimeType === 'image/jpeg' ? 'jpg' : 'png';
  return {
    driveFileId: document.driveFileId,
    mimeType: template.mimeType,
    fileName: `${document.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document'}.${extension}`,
  };
};

export const getDocument = async (actor: Actor, documentId: string) => {
  const document = await assertDocumentAccess({ ...actor, documentId });
  return prisma.hrmEmployeeDocument.findUnique({
    where: { id: document.id },
    select: {
      id: true, employeeId: true, category: true, title: true, fileRef: true, driveFileId: true,
      mimeType: true, fileSize: true, provider: true, providerReference: true, status: true,
      expiresAt: true, verifiedById: true, verifiedAt: true, rejectionReason: true, uploadedById: true,
      version: true, createdAt: true, updatedAt: true,
    },
  });
};

export const decideDocument = async (actor: Actor, documentId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.documentDecision, rawInput);
  await assertDocumentAccess({ ...actor, documentId });
  const before = await prisma.hrmEmployeeDocument.findUnique({ where: { id: documentId }, select: { id: true, status: true, version: true, employeeId: true } });
  if (!before) throw new HrmNotFoundError('Employee document not found.');
  await assertEmployeeWritable(before.employeeId, { allowLeft: true });
  await assertNotOwnRecord(actor, before.employeeId, 'Verifying a document');
  const result = await prisma.hrmEmployeeDocument.updateMany({
    where: { id: documentId, version: input.version },
    data: { status: input.status, rejectionReason: input.rejectionReason ?? null, verifiedById: actor.userId, verifiedAt: input.status === 'VERIFIED' ? new Date() : null, version: { increment: 1 } },
  });
  if (result.count !== 1) throw new HrmConflictError('Document was changed by another request. Refresh and retry.');
  const document = await prisma.hrmEmployeeDocument.findUnique({ where: { id: documentId } });
  await audit(actor, 'HRM_DOCUMENT', documentId, 'DECISION_UPDATED', document, before);
  return document;
};

export const upsertAttendance = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.attendance, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertEmployeeWritable(employeeId);
  await assertNotOwnRecord(actor, employeeId, 'Marking attendance');
  const record = await prisma.hrmAttendanceRecord.upsert({
    where: { employeeId_attendanceDate: { employeeId, attendanceDate: dateRequired(input.attendanceDate) } },
    update: { status: input.status, checkIn: input.checkIn ? new Date(input.checkIn) : null, checkOut: input.checkOut ? new Date(input.checkOut) : null, source: input.source ?? null, notes: input.notes ?? null, updatedAt: new Date() },
    create: { employeeId, attendanceDate: dateRequired(input.attendanceDate), status: input.status, checkIn: input.checkIn ? new Date(input.checkIn) : null, checkOut: input.checkOut ? new Date(input.checkOut) : null, source: input.source ?? null, notes: input.notes ?? null, createdById: actor.userId },
  });
  await audit(actor, 'HRM_ATTENDANCE', record.id, 'UPSERTED', record);
  return record;
};

export const listAttendance = async (actor: Actor, employeeId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  return prisma.hrmAttendanceRecord.findMany({ where: { employeeId }, orderBy: { attendanceDate: 'desc' }, take: 366 });
};

export const createLeaveRequest = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.leaveRequest, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertEmployeeWritable(employeeId);
  const existing = await prisma.hrmLeaveRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;
  const request = await prisma.hrmLeaveRequest.create({
    data: { employeeId, leaveTypeId: input.leaveTypeId, startDate: dateRequired(input.startDate), endDate: dateRequired(input.endDate), units: input.units, reason: input.reason ?? null, idempotencyKey: input.idempotencyKey, status: 'SUBMITTED' },
  });
  await audit(actor, 'HRM_LEAVE', request.id, 'SUBMITTED', request);
  return request;
};

export const listLeave = async (actor: Actor, employeeId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  return prisma.hrmLeaveRequest.findMany({ where: { employeeId }, include: { leaveType: true, approver: { select: { id: true, employeeCode: true, legalName: true } } }, orderBy: { startDate: 'desc' }, take: 200 });
};

export const decideLeave = async (actor: Actor, leaveId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.leaveDecision, rawInput);
  const request = await prisma.hrmLeaveRequest.findUnique({ where: { id: leaveId }, select: { id: true, employeeId: true, status: true, version: true } });
  if (!request) throw new HrmNotFoundError('Leave request not found.');
  await assertEmployeeAccess({ ...actor, employeeId: request.employeeId });
  await assertEmployeeWritable(request.employeeId, { allowLeft: true });
  await assertNotOwnRecord(actor, request.employeeId, 'Approving leave');
  const approver = input.status === 'APPROVED'
    ? (await prisma.hrmEmployee.findUnique({ where: { userId: actor.userId }, select: { id: true } }))?.id ?? null
    : null;
  const result = await prisma.hrmLeaveRequest.updateMany({
    where: { id: leaveId, version: input.version },
    data: { status: input.status, decisionReason: input.decisionReason ?? null, approvedAt: input.status === 'APPROVED' ? new Date() : null, approverEmployeeId: approver, version: { increment: 1 } },
  });
  if (result.count !== 1) throw new HrmConflictError('Leave request was changed by another request. Refresh and retry.');
  const updated = await prisma.hrmLeaveRequest.findUnique({ where: { id: leaveId } });
  await audit(actor, 'HRM_LEAVE', leaveId, 'DECISION_UPDATED', updated, request);
  return updated;
};

export const createCompensation = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.compensation, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertEmployeeWritable(employeeId);
  await assertNotOwnRecord(actor, employeeId, 'Proposing a salary');
  const revision = await prisma.hrmCompensationRevision.create({
    data: {
      employeeId, effectiveFrom: dateRequired(input.effectiveFrom), effectiveTo: dateOnly(input.effectiveTo), currency: input.currency,
      baseSalary: input.baseSalary, grossSalary: input.grossSalary, annualCtc: input.annualCtc ?? null,
      // Always waits for approval (hrm.compensation.approve): a salary is never approved by the person entering it.
      status: 'PENDING_APPROVAL', reason: input.reason ?? null, createdById: actor.userId,
      components: { create: (input.components ?? []).map((component) => ({ ...component, isRecurring: component.isRecurring ?? true, isTaxable: component.isTaxable ?? true })) },
    },
    include: { components: true },
  });
  await audit(actor, 'HRM_COMPENSATION', revision.id, 'CREATED', revision);
  return revision;
};

export const listCompensation = async (actor: Actor, employeeId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  return prisma.hrmCompensationRevision.findMany({ where: { employeeId }, include: { components: true }, orderBy: { effectiveFrom: 'desc' } });
};

export const createPerformanceReview = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.performanceReview, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertEmployeeWritable(employeeId);
  await assertNotOwnRecord(actor, employeeId, 'A performance review');
  const review = await prisma.hrmPerformanceReview.upsert({
    where: { employeeId_cycleId: { employeeId, cycleId: input.cycleId } },
    update: { reviewerEmployeeId: input.reviewerEmployeeId ?? null, status: input.status ?? 'DRAFT', rating: input.rating ?? null, goals: input.goals as any, strengths: input.strengths ?? null, improvementAreas: input.improvementAreas ?? null, employeeComment: input.employeeComment ?? null },
    create: { employeeId, cycleId: input.cycleId, reviewerEmployeeId: input.reviewerEmployeeId ?? null, status: input.status ?? 'DRAFT', rating: input.rating ?? null, goals: input.goals as any, strengths: input.strengths ?? null, improvementAreas: input.improvementAreas ?? null, employeeComment: input.employeeComment ?? null },
  });
  await audit(actor, 'HRM_PERFORMANCE', review.id, 'UPSERTED', review);
  return review;
};

export const listPerformance = async (actor: Actor, employeeId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  return prisma.hrmPerformanceReview.findMany({ where: { employeeId }, include: { cycle: true }, orderBy: { createdAt: 'desc' } });
};

export const createIncentive = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.incentive, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertEmployeeWritable(employeeId);
  await assertNotOwnRecord(actor, employeeId, 'An incentive');
  // A new incentive always waits for approval; it is never entered as approved or paid.
  const incentive = await prisma.hrmIncentive.create({ data: { employeeId, incentiveType: input.incentiveType, periodStart: dateRequired(input.periodStart), periodEnd: dateRequired(input.periodEnd), amount: input.amount, status: 'PENDING_APPROVAL', reason: input.reason ?? null, createdById: actor.userId } });
  await audit(actor, 'HRM_INCENTIVE', incentive.id, 'CREATED', incentive);
  return incentive;
};

export const listIncentives = async (actor: Actor, employeeId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  return prisma.hrmIncentive.findMany({ where: { employeeId }, orderBy: { periodStart: 'desc' } });
};

export const createExitCase = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.exitCase, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertEmployeeWritable(employeeId, { allowLeft: true });
  const exitCase = await prisma.hrmExitCase.create({ data: { employeeId, exitType: input.exitType, resignationDate: dateOnly(input.resignationDate), requestedLastDay: dateOnly(input.requestedLastDay), reason: input.reason ?? null, status: 'SUBMITTED', createdById: actor.userId } });
  await audit(actor, 'HRM_EXIT', exitCase.id, 'RESIGNATION_SUBMITTED', exitCase);
  return exitCase;
};

export const listExitCases = async (actor: Actor, employeeId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  return prisma.hrmExitCase.findMany({ where: { employeeId }, orderBy: { createdAt: 'desc' } });
};

export const createAccessScope = async (actor: Actor, rawInput: unknown) => {
  const input = parseHrmInput(schemas.accessScope, rawInput);
  // Same rules as the Access card: nobody grants wider access than they have, the shape must be valid, and the
  // person must be inside the granter's own scope.
  const abilities = await abilitiesOf(actor);
  if (input.userId === actor.userId && actor.role !== 'SUPER_ADMIN') throw new HrmAuthorizationError('You cannot give HRM access to yourself. Ask another HR user.');
  assertCanGrant(abilities, input);
  await checkScopeShape(prisma, input);
  const grantee = await prisma.hrmEmployee.findUnique({ where: { userId: input.userId }, select: { id: true } });
  if (grantee) await assertEmployeeAccess({ ...actor, employeeId: grantee.id });
  else if (!abilities.allIndia) throw new HrmAuthorizationError('Only an all-India HR user can give access to an account without an HR record.');
  const scope = await prisma.hrmAccessScope.create({ data: { ...input, orgUnitId: input.orgUnitId ?? null, operationalRegionId: input.operationalRegionId ?? null, stateId: input.stateId ?? null, includeChildren: input.includeChildren ?? true, activeFrom: dateRequired(input.activeFrom), activeTo: dateOnly(input.activeTo), createdById: actor.userId } });
  await audit(actor, 'HRM_ACCESS_SCOPE', scope.id, 'CREATED', scope);
  return scope;
};

const HRM_AUDIT_ENTITY_TYPES = new Set([
  'HRM_EMPLOYEE', 'HRM_ORG_UNIT', 'HRM_ASSIGNMENT', 'HRM_ACCESS_SCOPE', 'HRM_ONBOARDING',
  'HRM_DOCUMENT', 'HRM_ATTENDANCE', 'HRM_LEAVE', 'HRM_COMPENSATION', 'HRM_PERFORMANCE',
  'HRM_INCENTIVE', 'HRM_EXIT', 'HRM_APPROVAL',
]);

export const listAuditLogs = async (actor: Actor, entityType?: string, entityId?: string) => {
  if (entityType && !HRM_AUDIT_ENTITY_TYPES.has(entityType)) throw new HrmConflictError('Invalid HRM audit entity type.');
  // HRM audit rows hold whole profiles and salaries of every state: only all-India HR users read the log.
  if (actor.role !== 'SUPER_ADMIN') {
    const permissions = await getHrmPermissions(actor.userId, actor.role);
    if (!hasHrmPermission(permissions, HRM_PERMISSIONS.SCOPE_ALL) && !hasAllIndiaScope(await getActiveScopes(actor.userId))) {
      throw new HrmAuthorizationError('The HRM audit log is available to all-India HR users only.');
    }
  }
  return prisma.auditLog.findMany({
  // Never the platform-wide log: HRM entity types only.
  where: { entityType: entityType ? entity(entityType) : { in: [...HRM_AUDIT_ENTITY_TYPES].map(entity) }, ...(entityId ? { entityId: entityId.slice(0, 100) } : {}) },
  orderBy: { createdAt: 'desc' },
  take: 200,
  select: { id: true, actorUserId: true, entityType: true, entityId: true, action: true, beforeJson: true, afterJson: true, ipAddress: true, createdAt: true },
  });
};
