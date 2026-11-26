import type { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { insertManagedEmployeeUser, ManagedUserError, prepareManagedEmployeeUser } from '../../../services/managedEmployeeUser.service';
import { getAuthUniqueConstraintMessage } from '../../../utils/authUniqueConstraint';
import { getProfileMobileCandidates, normalizeProfileMobile } from '../../../utils/profileMobile';
import { assertAssignmentTargetAccess, assertEmployeeAccess, getAccessibleEmployeeIds, getHrmPermissions } from '../access';
import { writeHrmAudit } from '../audit';
import { listActiveDesignations, resolveDesignationForWrite } from './designation.service';
import { HrmAuthorizationError, HrmConflictError, HrmHttpError } from '../errors';
import { assertCanGiveRole } from '../employeeGuards';
import { abilitiesOf, mayManageState } from '../accessGrant';
import { createMissingChargeAccess } from '../chargeLifecycle';
import { findNationalOperationsManagers, STATE_MANAGER_DESIGNATION, syncOfficePrimaryManager, WORKING_STATUSES } from '../officeAssignments';
import { ensureStateOffice, findActiveStateOffice, listHeadOffices, requireHeadOffice, resolveHeadOffice } from '../officeUnits';
import { stateOfficeHolders } from './managerOptions.service';
import { HRM_PERMISSIONS, hasHrmPermission } from '../security';
import { parseHrmInput, schemas } from '../validation';

export { resolveHeadOffice };

type Actor = { userId: string; role: string; ipAddress?: string | null };

const USERS_CREATE_PERMISSION = 'users.create';
const USERS_READ_PERMISSION = 'users.read';
const EMPLOYEE_CODE_PREFIX = 'EMP-';

const formatEmployeeCode = (number: number) => `${EMPLOYEE_CODE_PREFIX}${String(number).padStart(4, '0')}`;

/** Next free EMP-0001 style code. Codes that do not follow the pattern (imported ones) are ignored. */
export const nextEmployeeCode = async (db: Prisma.TransactionClient | typeof prisma) => {
  const rows = await db.hrmEmployee.findMany({ where: { employeeCode: { startsWith: EMPLOYEE_CODE_PREFIX } }, select: { employeeCode: true } });
  let highest = 0;
  for (const { employeeCode } of rows) {
    const match = /^EMP-(\d{1,9})$/.exec(employeeCode);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return formatEmployeeCode(highest + 1);
};

type Db = Prisma.TransactionClient | typeof prisma;
const LEFT_COMPANY_STATUSES = ['EXITED', 'TERMINATED'];

/**
 * Every HR record (not archived) that shares this email or mobile, live ones first, with how each matched.
 * Pass the transaction client to check again under a lock.
 */
export const findEmployeeMatches = async (email: string | null | undefined, mobile: string | null | undefined, db: Db = prisma) => {
  const mobiles = mobile ? getProfileMobileCandidates(normalizeProfileMobile(mobile)) : [];
  // lower() instead of Prisma's case-insensitive equals: that is an ILIKE, and "_" in an address such as
  // amit_kumar@x.com would also match amit.kumar@x.com, blocking a different person.
  const lowerEmail = email?.trim().toLowerCase() ?? '';
  const byEmail = lowerEmail
    ? await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "HrmEmployee"
      WHERE "archivedAt" IS NULL AND (lower("workEmail") = ${lowerEmail} OR lower("personalEmail") = ${lowerEmail})
    `
    : [];
  if (!byEmail.length && !mobiles.length) return [];
  const emailIds = new Set(byEmail.map((row) => row.id));
  const rows = await db.hrmEmployee.findMany({
    where: {
      archivedAt: null,
      OR: [
        ...(byEmail.length ? [{ id: { in: [...emailIds] } }] : []),
        ...(mobiles.length ? [{ mobile: { in: mobiles } }] : []),
      ],
    },
    select: { id: true, employeeCode: true, legalName: true, userId: true, status: true, mobile: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows
    .map((row) => ({ ...row, matchedByEmail: emailIds.has(row.id), matchedByMobile: Boolean(row.mobile && mobiles.includes(row.mobile)) }))
    .sort((a, b) => Number(LEFT_COMPANY_STATUSES.includes(a.status)) - Number(LEFT_COMPANY_STATUSES.includes(b.status)));
};

/** A person who already has an HR record (for example from a recruitment offer) must not be entered a second time. */
export const findExistingEmployee = async (email: string | null | undefined, mobile: string | null | undefined, db: Db = prisma) =>
  (await findEmployeeMatches(email, mobile, db))[0] ?? null;

const existingEmployeeMessage = (employee: { employeeCode: string; legalName: string; userId: string | null }) =>
  `${employee.legalName} (${employee.employeeCode}) already has an HR record with this email or mobile number${employee.userId ? '' : ' but no login yet'}. Open that profile instead of adding the person again${employee.userId ? '' : ' and use “Link existing login” there'}.`;

const getAbilities = async (actor: Actor) => {
  const permissions = await getHrmPermissions(actor.userId, actor.role);
  return {
    canManageEmployees: hasHrmPermission(permissions, HRM_PERMISSIONS.EMPLOYEES_MANAGE),
    canAssign: hasHrmPermission(permissions, HRM_PERMISSIONS.ASSIGNMENTS_MANAGE),
    canCreateLogin: hasHrmPermission(permissions, USERS_CREATE_PERMISSION),
    canReadUsers: hasHrmPermission(permissions, USERS_READ_PERMISSION),
    canManageOrg: hasHrmPermission(permissions, HRM_PERMISSIONS.ORG_MANAGE),
  };
};
type Abilities = Awaited<ReturnType<typeof getAbilities>>;

const requireAbilities = (abilities: Abilities, needed: Array<[keyof Abilities, string]>, what: string) => {
  const missing = needed.filter(([key]) => !abilities[key]).map(([, permission]) => permission);
  if (missing.length) throw new HrmAuthorizationError(`${what} needs these permissions: ${missing.join(', ')}.`);
};

/** Everything the "Add employee" form needs, in one call, limited to what the caller may use. */
export const getEmployeeFormOptions = async (actor: Actor) => {
  const abilities = await getAbilities(actor);
  const nationalOperationsManagers = await findNationalOperationsManagers();

  const [departments, roles, states, stateOffices, designations, headOffices, code] = await Promise.all([
    prisma.hrmOrgUnit.findMany({ where: { type: 'DEPARTMENT', isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
    abilities.canCreateLogin
      ? prisma.customRole.findMany({ select: { id: true, name: true, description: true }, orderBy: { name: 'asc' } })
      : Promise.resolve([]),
    prisma.state.findMany({ where: { country: { iso2: 'IN' } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.hrmOrgUnit.findMany({ where: { type: 'REGION', stateId: { not: null } }, select: { id: true, stateId: true, isActive: true } }),
    listActiveDesignations(),
    listHeadOffices(prisma),
    nextEmployeeCode(prisma),
  ]);

  const officeByState = new Map(stateOffices.filter((office) => office.isActive).map((office) => [office.stateId!, office.id]));
  const switchedOffStates = new Set(stateOffices.filter((office) => !office.isActive).map((office) => office.stateId!));
  return {
    nextEmployeeCode: code,
    abilities,
    departments,
    roles,
    // Every state of the master is selectable. A state without an office gets one when an administrator adds someone.
    states: states.map((state) => ({ id: state.id, name: state.name, hasOffice: officeByState.has(state.id), officeSwitchedOff: !officeByState.has(state.id) && switchedOffStates.has(state.id) })),
    designations,
    // Every head office, the default first (empty until one is set up).
    headOffices,
    nationalOperationsManagers,
    stateManagerDesignation: STATE_MANAGER_DESIGNATION,
  };
};

type PlacementInput = {
  orgUnitId: string;
  managerEmployeeId?: string | null | undefined;
  locationType: 'HEAD_OFFICE' | 'STATE_OFFICE';
  headOfficeUnitId?: string | null | undefined;
  stateId?: number | null | undefined;
  cityId?: number | null | undefined;
  isOfficeManager?: boolean | undefined;
};

/**
 * Checks everything about where the new employee goes before anything is written: department, reporting manager,
 * the location, and that the place is inside the caller's own scope. The state office unit itself is resolved inside
 * the transaction because a state without an office gets one created there.
 */
const validatePlacement = async (actor: Actor, input: PlacementInput) => {
  const department = await prisma.hrmOrgUnit.findFirst({ where: { id: input.orgUnitId, type: 'DEPARTMENT', isActive: true }, select: { id: true } });
  if (!department) throw new HrmHttpError(400, 'DEPARTMENT_NOT_FOUND', 'The selected department was not found or is inactive.');

  // With nobody named, a State Manager reports to the National Operations Manager when there is exactly one.
  const national = await findNationalOperationsManagers();
  let managerEmployeeId = input.managerEmployeeId;
  if (managerEmployeeId === undefined && input.isOfficeManager) {
    if (national.length > 1) {
      const message = 'There is more than one National Operations Manager. Choose who this State Manager reports to.';
      throw new HrmHttpError(400, 'MANAGER_REQUIRED', message, [{ path: ['managerEmployeeId'], message }]);
    }
    managerEmployeeId = national.length === 1 ? national[0]!.id : null;
  }
  if (managerEmployeeId) {
    const accessibleIds = await getAccessibleEmployeeIds(actor);
    let allowed = !accessibleIds || accessibleIds.includes(managerEmployeeId) || national.some((manager) => manager.id === managerEmployeeId);
    // The reporting manager list offers a state's own manager and charge holder to whoever covers that state, even
    // when that person is posted elsewhere: what the list offers must also save.
    if (!allowed && input.locationType === 'STATE_OFFICE' && input.stateId && mayManageState(await abilitiesOf(actor), input.stateId)) {
      const office = await findActiveStateOffice(prisma, input.stateId);
      const holders = office ? await stateOfficeHolders(office.id) : null;
      allowed = Boolean(holders && [...holders.managerIds, ...holders.chargeIds].includes(managerEmployeeId));
    }
    const manager = allowed
      ? await prisma.hrmEmployee.findFirst({ where: { id: managerEmployeeId, status: { in: [...WORKING_STATUSES] }, archivedAt: null }, select: { id: true } })
      : null;
    if (!manager) throw new HrmHttpError(400, 'MANAGER_NOT_FOUND', 'The selected reporting manager is not available.');
  }

  let location: { stateId: number; cityId: number };
  let headOfficeUnitId: string | null = null;
  if (input.locationType === 'HEAD_OFFICE') {
    // The chosen head office (the default when none was chosen) is where the person is recorded.
    const office = await requireHeadOffice(prisma, input.headOfficeUnitId);
    location = { stateId: office.stateId, cityId: office.cityId };
    headOfficeUnitId = office.id;
  } else {
    const city = await prisma.city.findFirst({
      where: { id: input.cityId!, stateId: input.stateId!, state: { country: { iso2: 'IN' } } },
      select: { id: true, stateId: true },
    });
    if (!city) throw new HrmHttpError(400, 'LOCATION_INVALID', 'The selected city does not belong to the selected state.');
    location = { stateId: city.stateId, cityId: city.id };
  }

  await assertAssignmentTargetAccess({
    userId: actor.userId, role: actor.role,
    target: { orgUnitId: department.id, officeUnitId: headOfficeUnitId, stateId: location.stateId, managerEmployeeId: managerEmployeeId ?? null },
  });
  return { department, location, headOfficeUnitId, managerEmployeeId: managerEmployeeId ?? null, isOfficeManager: input.locationType === 'STATE_OFFICE' && Boolean(input.isOfficeManager) };
};
type Placement = Awaited<ReturnType<typeof validatePlacement>>;

const dateOnlyValue = (value: string | null | undefined) => (value ? new Date(`${value}T00:00:00.000Z`) : null);

type NewEmployeeDetails = {
  employeeCode: string;
  legalName: string;
  workEmail: string;
  mobile: string | null;
  joiningDate: Date;
  userId: string;
  preferredName?: string | null | undefined;
  dateOfBirth?: string | null | undefined;
  personalEmail?: string | null | undefined;
};

/** Writes the HR record, its first assignment and the audit rows. Runs inside the caller's transaction. */
const createEmployeeWithAssignment = async (
  tx: Prisma.TransactionClient,
  actor: Actor,
  abilities: Abilities,
  details: NewEmployeeDetails,
  placement: Placement,
  input: { locationType: 'HEAD_OFFICE' | 'STATE_OFFICE'; designation: string; employmentType?: string | undefined },
) => {
  const officeUnitId = input.locationType === 'HEAD_OFFICE'
    ? placement.headOfficeUnitId
    : (await ensureStateOffice(tx, actor, placement.location.stateId, abilities.canManageOrg)).unit.id;

  const employee = await tx.hrmEmployee.create({
    data: {
      employeeCode: details.employeeCode,
      legalName: details.legalName,
      preferredName: details.preferredName?.trim() || null,
      workEmail: details.workEmail,
      personalEmail: details.personalEmail?.trim().toLowerCase() || null,
      mobile: details.mobile,
      dateOfBirth: dateOnlyValue(details.dateOfBirth),
      joinedOn: details.joiningDate,
      userId: details.userId,
      source: 'DIRECT_HR',
      status: 'ONBOARDING',
      createdById: actor.userId,
    },
    select: { id: true, employeeCode: true, legalName: true, workEmail: true, mobile: true, joinedOn: true, status: true, userId: true },
  });

  const assignment = await tx.hrmEmploymentAssignment.create({
    data: {
      employeeId: employee.id,
      orgUnitId: placement.department.id,
      officeUnitId,
      isOfficeManager: placement.isOfficeManager,
      designation: input.designation,
      employmentType: (input.employmentType ?? 'FULL_TIME') as 'FULL_TIME',
      stateId: placement.location.stateId,
      cityId: placement.location.cityId,
      managerEmployeeId: placement.managerEmployeeId,
      // ACTIVE from the joining date. Every reader also requires effectiveFrom <= today, so a future
      // date simply is not current yet and takes effect on its own on that day.
      status: 'ACTIVE',
      effectiveFrom: details.joiningDate,
      createdById: actor.userId,
    },
    select: { id: true, designation: true, employmentType: true, status: true, effectiveFrom: true, stateId: true, cityId: true, orgUnitId: true, officeUnitId: true, isOfficeManager: true, managerEmployeeId: true },
  });

  if (placement.isOfficeManager) await syncOfficePrimaryManager(tx, officeUnitId);
  return { employee, assignment };
};

const auditWith = (actor: Actor, tx: Prisma.TransactionClient) =>
  (entityType: 'HRM_EMPLOYEE' | 'HRM_ASSIGNMENT', entityId: string, action: string, after: unknown) =>
    writeHrmAudit({ actorUserId: actor.userId, entityType, entityId, action, after, ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}) }, tx);

const employeeCodeConflict = (error: unknown) => {
  const target = String((error as { meta?: { target?: unknown } })?.meta?.target ?? '').toLowerCase();
  return (error as { code?: unknown })?.code === 'P2002' && target.includes('employeecode');
};

/**
 * Creates the employee, their login account and their first assignment in ONE transaction, so a failure
 * halfway never leaves a login without an employee (or the other way round). The login password is
 * hashed, never stored in clear text, never audited and never returned.
 */
export const onboardEmployeeWithLogin = async (actor: Actor, rawInput: unknown) => {
  const input = parseHrmInput(schemas.onboardEmployee, rawInput);

  const abilities = await getAbilities(actor);
  requireAbilities(abilities, [
    ['canManageEmployees', 'hrm.employees.manage'],
    ['canAssign', 'hrm.assignments.manage'],
    ['canCreateLogin', USERS_CREATE_PERMISSION],
  ], 'Adding an employee with a login');

  const placement = await validatePlacement(actor, input);

  const existingEmployee = await findExistingEmployee(input.email, input.mobile);
  if (existingEmployee) throw new HrmConflictError(existingEmployeeMessage(existingEmployee));
  const designation = await resolveDesignationForWrite(prisma, actor, input.designation, { canCreate: abilities.canManageOrg });

  await assertCanGiveRole(actor, input.customRoleId ?? null);
  let prepared;
  try {
    prepared = await prepareManagedEmployeeUser(prisma, {
      name: input.fullName,
      email: input.email,
      mobile: input.mobile,
      password: input.password,
      role: 'EMPLOYEE',
      title: designation,
      customRoleId: input.customRoleId ?? null,
    });
  } catch (error) {
    if (error instanceof ManagedUserError) throw new HrmHttpError(error.statusCode, 'EMPLOYEE_LOGIN_INVALID', error.message);
    throw error;
  }

  const joiningDate = new Date(`${input.joiningDate}T00:00:00.000Z`);
  try {
    return await prisma.$transaction(async (tx) => {
      // Serialise code generation so two people adding employees at once never get the same code.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'hrm-employee-code'}))`;
      // Check again under the lock: an accepted offer may be turning the same person into an HR record right now.
      const sameNow = await findExistingEmployee(input.email, input.mobile, tx);
      if (sameNow) throw new HrmConflictError(existingEmployeeMessage(sameNow));
      const employeeCode = await nextEmployeeCode(tx);

      const user = await insertManagedEmployeeUser(tx, prepared, {
        createdById: actor.userId,
        include: { customRole: { select: { id: true, name: true } } },
      }) as unknown as { id: string; email: string; name: string | null; customRole: { id: string; name: string } | null };

      const { employee, assignment } = await createEmployeeWithAssignment(tx, actor, abilities, {
        employeeCode, legalName: prepared.name, workEmail: prepared.email, mobile: prepared.mobile, joiningDate, userId: user.id,
        preferredName: input.preferredName, dateOfBirth: input.dateOfBirth, personalEmail: input.personalEmail,
      }, placement, { locationType: input.locationType, designation, employmentType: input.employmentType });

      const audit = auditWith(actor, tx);
      await audit('HRM_EMPLOYEE', employee.id, 'CREATED_WITH_LOGIN', { ...employee, loginUserId: user.id, customRoleId: user.customRole?.id ?? null });
      await audit('HRM_ASSIGNMENT', assignment.id, 'CREATED', assignment);

      return {
        employee,
        assignment,
        user: { id: user.id, name: user.name, email: user.email, role: user.customRole ? { id: user.customRole.id, name: user.customRole.name } : null },
      };
    }, { timeout: 20000, maxWait: 5000 });
  } catch (error) {
    if (employeeCodeConflict(error)) throw new HrmConflictError('That employee ID was just taken by someone else. Please try again.');
    const duplicate = getAuthUniqueConstraintMessage(error, 'admin');
    if (duplicate) throw new HrmConflictError(duplicate);
    throw error;
  }
};

/** Logins an HR record can be linked to: the employee accounts created on the Users page. */
const LINKABLE_USER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

/**
 * Employee logins that have no HR record yet, for the "Link existing login" picker. A login whose email or mobile
 * already belongs to an HR record is returned with that record so the screen can send the person there instead.
 */
export const listLinkableUsers = async (actor: Actor, rawQuery: unknown) => {
  const query = parseHrmInput(schemas.linkableUsersQuery, rawQuery);
  const abilities = await getAbilities(actor);
  requireAbilities(abilities, [
    ['canManageEmployees', 'hrm.employees.manage'],
    ['canReadUsers', USERS_READ_PERMISSION],
  ], 'Linking an existing login');

  const search = query.search;
  const digits = search?.replace(/\D/g, '') ?? '';
  const users = await prisma.user.findMany({
    where: {
      role: 'EMPLOYEE',
      status: { in: [...LINKABLE_USER_STATUSES] },
      archivedAt: null,
      hrmEmployee: { is: null },
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ mobile: { contains: digits } }] : []),
        ],
      } : {}),
    },
    select: {
      id: true, name: true, email: true, mobile: true, status: true, createdAt: true,
      customRole: { select: { id: true, name: true } },
      adminProfile: { select: { title: true } },
    },
    orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
    take: query.limit ?? 25,
  });

  const rows = [];
  for (const user of users) {
    const matching = await findExistingEmployee(user.email, user.mobile);
    rows.push({
      id: user.id,
      name: user.name ?? '',
      email: user.email,
      mobile: user.mobile,
      status: user.status,
      title: user.adminProfile?.title ?? null,
      role: user.customRole ? { id: user.customRole.id, name: user.customRole.name } : null,
      createdAt: user.createdAt,
      matchingEmployee: matching ? { id: matching.id, employeeCode: matching.employeeCode, name: matching.legalName, hasLogin: Boolean(matching.userId) } : null,
    });
  }
  return { users: rows };
};

/** Loads a login that may be linked: an employee account, not yet attached to anybody. */
export const loadLinkableUser = async (userId: string) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'EMPLOYEE', archivedAt: null },
    select: {
      id: true, name: true, email: true, mobile: true, status: true,
      customRole: { select: { id: true, name: true } },
      hrmEmployee: { select: { id: true, employeeCode: true } },
    },
  });
  if (!user) throw new HrmHttpError(404, 'LOGIN_NOT_FOUND', 'That login was not found, or it is not an employee account.');
  if (!(LINKABLE_USER_STATUSES as readonly string[]).includes(user.status)) {
    throw new HrmHttpError(409, 'LOGIN_NOT_AVAILABLE', 'That login is suspended or closed, so it cannot be linked.');
  }
  if (user.hrmEmployee) {
    throw new HrmConflictError(`That login already belongs to ${user.hrmEmployee.employeeCode}. Open that profile instead.`);
  }
  return user;
};

/**
 * Adds an HR record for a login that already exists (created earlier on the Users page): the name, email and
 * mobile come from the login, HR fills in the rest (joining date, designation, department, location, manager and
 * the optional profile details). No second login is created, so nobody has to be added twice.
 */
export const onboardExistingLogin = async (actor: Actor, rawInput: unknown) => {
  const input = parseHrmInput(schemas.onboardExistingEmployee, rawInput);

  const abilities = await getAbilities(actor);
  requireAbilities(abilities, [
    ['canManageEmployees', 'hrm.employees.manage'],
    ['canAssign', 'hrm.assignments.manage'],
    ['canReadUsers', USERS_READ_PERMISSION],
  ], 'Linking an existing login');

  const user = await loadLinkableUser(input.userId);
  if (!user.email) throw new HrmHttpError(409, 'LOGIN_HAS_NO_EMAIL', 'That login has no email address. Add one on the Users page first.');
  const legalName = (user.name ?? '').trim();
  if (legalName.length < 2) throw new HrmHttpError(409, 'LOGIN_HAS_NO_NAME', 'That login has no name. Add one on the Users page first.');

  // The login's own mobile wins; HR can supply one only when the login has none.
  const loginMobile = user.mobile ? normalizeProfileMobile(user.mobile) : null;
  const typedMobile = !loginMobile && input.mobile ? normalizeProfileMobile(input.mobile) : null;
  if (!loginMobile && input.mobile && !typedMobile) throw new HrmHttpError(400, 'MOBILE_INVALID', 'Enter a valid 10-digit mobile number.');
  const mobile = loginMobile || typedMobile || null;

  const placement = await validatePlacement(actor, input);
  const existingEmployee = await findExistingEmployee(user.email, mobile);
  if (existingEmployee) throw new HrmConflictError(existingEmployeeMessage(existingEmployee));
  const designation = await resolveDesignationForWrite(prisma, actor, input.designation, { canCreate: abilities.canManageOrg });
  const joiningDate = new Date(`${input.joiningDate}T00:00:00.000Z`);

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'hrm-employee-code'}))`;
      // Re-check inside the lock: two people may be linking the same login at once.
      const taken = await tx.hrmEmployee.findFirst({ where: { userId: user.id }, select: { employeeCode: true } });
      if (taken) throw new HrmConflictError(`That login already belongs to ${taken.employeeCode}. Open that profile instead.`);
      const sameNow = await findExistingEmployee(user.email, mobile, tx);
      if (sameNow) throw new HrmConflictError(existingEmployeeMessage(sameNow));
      const employeeCode = await nextEmployeeCode(tx);

      const { employee, assignment } = await createEmployeeWithAssignment(tx, actor, abilities, {
        employeeCode, legalName, workEmail: user.email!.trim().toLowerCase(), mobile, joiningDate, userId: user.id,
        preferredName: input.preferredName, dateOfBirth: input.dateOfBirth, personalEmail: input.personalEmail,
      }, placement, { locationType: input.locationType, designation, employmentType: input.employmentType });

      const audit = auditWith(actor, tx);
      await audit('HRM_EMPLOYEE', employee.id, 'CREATED_FROM_EXISTING_LOGIN', { ...employee, loginUserId: user.id });
      await audit('HRM_ASSIGNMENT', assignment.id, 'CREATED', assignment);

      return {
        employee,
        assignment,
        user: { id: user.id, name: user.name, email: user.email, role: user.customRole ? { id: user.customRole.id, name: user.customRole.name } : null },
      };
    }, { timeout: 20000, maxWait: 5000 });
  } catch (error) {
    if (employeeCodeConflict(error)) throw new HrmConflictError('That employee ID was just taken by someone else. Please try again.');
    if ((error as { code?: unknown })?.code === 'P2002') throw new HrmConflictError('That login was just linked to another employee. Refresh and try again.');
    throw error;
  }
};

/** Attaches an existing login to an HR record that has none (for example one created from a recruitment offer). */
export const linkLoginToEmployee = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.linkLogin, rawInput);
  const abilities = await getAbilities(actor);
  requireAbilities(abilities, [
    ['canManageEmployees', 'hrm.employees.manage'],
    ['canReadUsers', USERS_READ_PERMISSION],
  ], 'Linking an existing login');
  await assertEmployeeAccess({ ...actor, employeeId });
  if (input.userId === actor.userId && actor.role !== 'SUPER_ADMIN') throw new HrmAuthorizationError('You cannot link your own login. Ask another HR user.');

  const employee = await prisma.hrmEmployee.findUnique({ where: { id: employeeId }, select: { id: true, employeeCode: true, userId: true, archivedAt: true, status: true } });
  if (!employee || employee.archivedAt) throw new HrmHttpError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found.');
  if (employee.userId) throw new HrmConflictError(`${employee.employeeCode} already has a login.`);
  if (employee.status === 'EXITED' || employee.status === 'TERMINATED') throw new HrmConflictError(`${employee.employeeCode} has left the company, so a login cannot be linked.`);
  const user = await loadLinkableUser(input.userId);
  const grant = await abilitiesOf(actor);

  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.hrmEmployee.updateMany({
        where: { id: employeeId, userId: null },
        // The login owns the identity: the HR copy of the work email / mobile starts in step with it.
        data: { userId: user.id, workEmail: user.email, ...(user.mobile ? { mobile: user.mobile } : {}), version: { increment: 1 } },
      });
      if (result.count !== 1) throw new HrmConflictError('This employee was just linked to a login. Refresh and try again.');
      await auditWith(actor, tx)('HRM_EMPLOYEE', employeeId, 'LOGIN_LINKED', { loginUserId: user.id });
      await createMissingChargeAccess(tx, actor, employeeId, user.id, (stateId) => grant.canManageScopes && (grant.allIndia || grant.ownStates.has(stateId)));
    });
  } catch (error) {
    if ((error as { code?: unknown })?.code === 'P2002') throw new HrmConflictError('That login was just linked to another employee. Refresh and try again.');
    throw error;
  }
  return { employeeId, user: { id: user.id, name: user.name, email: user.email, role: user.customRole ? { id: user.customRole.id, name: user.customRole.name } : null } };
};
