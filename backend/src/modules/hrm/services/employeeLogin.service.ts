import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { getProfileMobileCandidates, normalizeProfileMobile } from '../../../utils/profileMobile';
import { normalizeProfileEmail } from '../../../utils/profileSecurity';
import { assertEmployeeAccess, getHrmPermissions } from '../access';
import { writeHrmAudit } from '../audit';
import { HrmAuthorizationError, HrmConflictError, HrmHttpError } from '../errors';
import { HRM_PERMISSIONS, hasHrmPermission } from '../security';
import { parseHrmInput, schemas } from '../validation';

type Actor = { userId: string; role: string; ipAddress?: string | null };
type Tx = Prisma.TransactionClient;

/**
 * Keeps an employee's HR record and their login account saying the same thing. The login owns the identity
 * (email, mobile, password); the HR record shows a copy. So:
 *  - changing the work email / mobile of an employee who has a login goes through the login (same rules as the Users
 *    screen: valid, unique, and the person has to sign in again), never only on the HR record;
 *  - changing them on the Users screen follows through to the HR record (syncHrmEmployeeFromLogin);
 *  - a password reset from the HR profile uses the same hashing and session invalidation as the Users screen.
 */

const USERS_UPDATE_PERMISSION = 'users.update';

const sameEmail = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

export const requireUsersUpdate = async (actor: Actor, what: string) => {
  // The Users screen is for a Super Admin or an operator (employee / admin) holding the permission: the same people here.
  if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'EMPLOYEE' && actor.role !== 'ADMIN') {
    throw new HrmAuthorizationError(`${what} changes the login account, which only a Super Admin or an employee with ${USERS_UPDATE_PERMISSION} may do.`);
  }
  const permissions = await getHrmPermissions(actor.userId, actor.role);
  if (!hasHrmPermission(permissions, USERS_UPDATE_PERMISSION)) {
    throw new HrmAuthorizationError(`${what} changes the login account, so it needs the ${USERS_UPDATE_PERMISSION} permission.`);
  }
};

/**
 * Writes a new email and/or mobile on the login, with the Users screen's rules. Returns the stored (normalised)
 * values so the HR record can copy them. Runs inside the caller's transaction.
 */
export const applyLoginIdentityChange = async (
  tx: Tx,
  userId: string,
  change: { email?: string | null | undefined; mobile?: string | null | undefined },
) => {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, mobile: true, role: true } });
  if (!user) throw new HrmHttpError(404, 'LOGIN_NOT_FOUND', 'The login account was not found.');
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') throw new HrmConflictError('An administrator login is changed on the Users screen, not from HRM.');

  let email = user.email;
  if (change.email !== undefined) {
    if (change.email === null || !change.email.trim()) throw new HrmHttpError(400, 'EMAIL_REQUIRED', 'A login needs an email address.');
    try {
      email = normalizeProfileEmail(change.email);
    } catch (error) {
      throw new HrmHttpError(400, 'EMAIL_INVALID', error instanceof Error ? error.message : 'Enter a valid email address.');
    }
    // lower() = lower(): Prisma's case-insensitive equals is an ILIKE, where "_" and "%" in an address act as wildcards.
    const duplicate = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE lower("email") = lower(${email!}) AND "id" <> ${userId} LIMIT 1`;
    if (duplicate.length) throw new HrmConflictError('Email address is already in use.');
  }

  let mobile = user.mobile;
  if (change.mobile !== undefined && change.mobile !== null && change.mobile.trim()) {
    const normalized = normalizeProfileMobile(change.mobile);
    if (!normalized) throw new HrmHttpError(400, 'MOBILE_INVALID', 'Enter a valid 10-digit mobile number.');
    const duplicate = await tx.user.findFirst({ where: { id: { not: userId }, mobile: { in: getProfileMobileCandidates(normalized) } }, select: { id: true } });
    if (duplicate) throw new HrmConflictError('Mobile number is already in use.');
    mobile = normalized;
  } else if (change.mobile === null || (typeof change.mobile === 'string' && !change.mobile.trim())) {
    // The login keeps its number; it is removed on the Users screen, not by blanking a copy.
    if (user.mobile) throw new HrmHttpError(400, 'MOBILE_REQUIRED', 'This login has a mobile number. Change it here, or remove it on the Users screen.');
  }

  const changed = !sameEmail(email, user.email) || (mobile ?? null) !== (user.mobile ?? null);
  if (changed) {
    await tx.user.update({
      where: { id: userId },
      // Same as the Users screen: signing-in details changed, so existing sessions end.
      data: { email, mobile, authVersion: { increment: 1 } },
    });
  }
  return { email, mobile, changed };
};

/** HR sets a new login password for an employee (for example when they forgot the temporary one). */
export const resetEmployeeLoginPassword = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.resetLoginPassword, rawInput);
  const permissions = await getHrmPermissions(actor.userId, actor.role);
  if (!hasHrmPermission(permissions, HRM_PERMISSIONS.EMPLOYEES_MANAGE)) throw new HrmAuthorizationError('Resetting a login password needs the hrm.employees.manage permission.');
  await requireUsersUpdate(actor, 'Resetting a password');
  await assertEmployeeAccess({ ...actor, employeeId });

  const employee = await prisma.hrmEmployee.findUnique({ where: { id: employeeId }, select: { id: true, employeeCode: true, userId: true, user: { select: { role: true, status: true } } } });
  if (!employee) throw new HrmHttpError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found.');
  if (!employee.userId || !employee.user) throw new HrmConflictError(`${employee.employeeCode} has no login account. Link or create one first.`);
  if (employee.user.role === 'SUPER_ADMIN' || employee.user.role === 'ADMIN') throw new HrmConflictError('An administrator password is changed on the Users screen, not from HRM.');
  if (employee.userId === actor.userId) throw new HrmConflictError('Change your own password from your profile, not here.');

  const hashed = await bcrypt.hash(input.password, 10);
  await prisma.$transaction(async (tx) => {
    // authVersion ends every existing session, so the old password stops working everywhere at once.
    await tx.user.update({ where: { id: employee.userId! }, data: { password: hashed, authVersion: { increment: 1 } } });
    await writeHrmAudit({
      actorUserId: actor.userId,
      entityType: 'HRM_EMPLOYEE',
      entityId: employeeId,
      // The password itself is never written anywhere.
      action: 'LOGIN_PASSWORD_RESET',
      after: { loginUserId: employee.userId },
      ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}),
    }, tx);
  });
  return { employeeId, reset: true, loginStatus: employee.user.status };
};

/**
 * Called after the Users screen changed a login's name, email or mobile. The HR record follows, but only where it was
 * in step with the login before: a work email, mobile or legal name that HR edited on purpose is left alone.
 * Never throws (the account update has already succeeded).
 */
export const syncHrmEmployeeFromLogin = async (input: {
  userId: string;
  actorUserId?: string | undefined;
  previous: { name?: string | null; email?: string | null; mobile?: string | null };
  next: { name?: string | null; email?: string | null; mobile?: string | null };
}) => {
  try {
    const employee = await prisma.hrmEmployee.findUnique({ where: { userId: input.userId }, select: { id: true, legalName: true, workEmail: true, mobile: true } });
    if (!employee) return;
    const data: Prisma.HrmEmployeeUpdateInput = {};

    const nextEmail = input.next.email?.trim().toLowerCase();
    if (nextEmail && !sameEmail(employee.workEmail, nextEmail) && (!employee.workEmail || sameEmail(employee.workEmail, input.previous.email))) data.workEmail = nextEmail;

    const nextMobile = input.next.mobile ? normalizeProfileMobile(input.next.mobile) : null;
    const previousMobiles = input.previous.mobile ? getProfileMobileCandidates(input.previous.mobile) : [];
    if (nextMobile && nextMobile !== employee.mobile && (!employee.mobile || previousMobiles.includes(employee.mobile))) data.mobile = nextMobile;

    const nextName = input.next.name?.trim();
    if (nextName && nextName !== employee.legalName && employee.legalName === (input.previous.name ?? '').trim()) data.legalName = nextName;

    if (!Object.keys(data).length) return;
    await prisma.$transaction(async (tx) => {
      await tx.hrmEmployee.update({ where: { id: employee.id }, data: { ...data, version: { increment: 1 } } });
      await writeHrmAudit({
        actorUserId: input.actorUserId ?? input.userId,
        entityType: 'HRM_EMPLOYEE',
        entityId: employee.id,
        action: 'LOGIN_IDENTITY_SYNCED',
        after: Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'version')),
      }, tx);
    });
  } catch (error) {
    console.error('[hrm] could not copy a login change to the HR record', error instanceof Error ? error.message : error);
  }
};
