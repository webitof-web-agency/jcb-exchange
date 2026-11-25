import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { allowedAdminPermissions } from '../utils/adminPermissions';
import { getProfileMobileCandidates, normalizeProfileMobile } from '../utils/profileMobile';
import { normalizeProfileEmail } from '../utils/profileSecurity';
import { initializeUserNotificationPreferences } from './notificationPreference.service';

/**
 * Creating an EMPLOYEE login account. Shared by the Users screen (POST /superadmin/users) and the HRM
 * "Add employee" flow so both validate and create the account in exactly the same way.
 * It is split in two so a caller can validate and hash first, then insert inside its own transaction.
 */
export class ManagedUserError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'ManagedUserError';
  }
}

type Db = Prisma.TransactionClient | typeof prisma;

export type ManagedEmployeeUserInput = {
  name?: string | undefined;
  email?: string | undefined;
  mobile?: unknown;
  password?: string | undefined;
  role?: string | undefined;
  title?: string | undefined;
  permissions?: string[] | undefined;
  customRoleId?: string | null | undefined;
};

export type PreparedManagedEmployeeUser = {
  name: string;
  email: string;
  mobile: string | null;
  hashedPassword: string;
  role: 'EMPLOYEE';
  title: string;
  customRoleId: string | null;
  permissions: string[];
};

/** Validates the request and checks that the email / mobile are free. Nothing is written. */
export const prepareManagedEmployeeUser = async (db: Db, input: ManagedEmployeeUserInput): Promise<PreparedManagedEmployeeUser> => {
  const { name, email, mobile, password, role, title, permissions, customRoleId } = input;

  if (!name || !email || !password || !role) {
    throw new ManagedUserError(400, 'Name, email, password, and role are required.');
  }
  if (role !== 'EMPLOYEE') {
    throw new ManagedUserError(400, 'Only employee accounts can be created here.');
  }
  if (password.length < 8) {
    throw new ManagedUserError(400, 'Password must be at least 8 characters long.');
  }

  let normalizedEmail: string;
  try {
    normalizedEmail = normalizeProfileEmail(email) || '';
  } catch (error) {
    throw new ManagedUserError(400, error instanceof Error ? error.message : 'Enter a valid email address.');
  }

  if (mobile !== undefined && typeof mobile !== 'string') {
    throw new ManagedUserError(400, 'Mobile number must be a string.');
  }
  const rawMobile = typeof mobile === 'string' ? mobile.trim() : '';
  const normalizedMobile = normalizeProfileMobile(rawMobile);
  if (rawMobile && !normalizedMobile) {
    throw new ManagedUserError(400, 'Enter a valid 10-digit mobile number.');
  }

  const duplicateEmailUser = await db.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    select: { id: true },
  });
  if (duplicateEmailUser) throw new ManagedUserError(409, 'Email address is already in use.');

  if (normalizedMobile) {
    const duplicateMobileUser = await db.user.findFirst({
      where: { mobile: { in: getProfileMobileCandidates(normalizedMobile) } },
      select: { id: true },
    });
    if (duplicateMobileUser) throw new ManagedUserError(409, 'Mobile number is already in use.');
  }

  const normalizedCustomRoleId = typeof customRoleId === 'string' && customRoleId.trim() ? customRoleId.trim() : null;
  if (normalizedCustomRoleId) {
    const customRole = await db.customRole.findUnique({ where: { id: normalizedCustomRoleId }, select: { id: true } });
    if (!customRole) throw new ManagedUserError(400, 'Selected employee role was not found.');
  }

  return {
    name: name.trim(),
    email: normalizedEmail,
    mobile: normalizedMobile,
    hashedPassword: await bcrypt.hash(password, 10),
    role: 'EMPLOYEE',
    title: title || 'Operations Employee',
    customRoleId: normalizedCustomRoleId,
    permissions: Array.isArray(permissions) ? permissions.filter((permission) => allowedAdminPermissions.has(permission)) : [],
  };
};

/** Inserts the prepared account (with its admin profile, permissions and notification preferences). */
export const insertManagedEmployeeUser = async (
  tx: Prisma.TransactionClient,
  prepared: PreparedManagedEmployeeUser,
  options: { createdById?: string | undefined; include?: Prisma.UserInclude | undefined } = {},
) => {
  const user = await tx.user.create({
    data: {
      name: prepared.name,
      email: prepared.email,
      mobile: prepared.mobile || undefined,
      password: prepared.hashedPassword,
      role: prepared.role,
      customRoleId: prepared.customRoleId,
      status: 'ACTIVE' as any,
      authProvider: 'LOCAL',
      createdById: options.createdById,
      adminProfile: {
        create: {
          title: prepared.title,
          isRootAdmin: false,
        },
      },
      adminPermissions: prepared.customRoleId || prepared.permissions.length === 0
        ? undefined
        : { create: prepared.permissions.map((permission) => ({ permission })) },
    } as any,
    ...(options.include ? { include: options.include } : {}),
  });
  await initializeUserNotificationPreferences(user as any, tx);
  return user;
};
