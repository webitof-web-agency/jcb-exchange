// Creates the first (root) super admin on a new or restored database. Public sign-up never does this.
//
//   SUPERADMIN_EMAIL=owner@example.com SUPERADMIN_NAME="Owner" SUPERADMIN_PASSWORD='...' \
//     npm run admin:create
//
// Optional: SUPERADMIN_MOBILE. The password is read from the environment so it never lands in shell
// history as an argument. The script refuses to run when an active super admin already exists, and it
// takes a database advisory lock so two runs cannot both create a root account.
import bcrypt from 'bcryptjs';
import prisma from '../src/lib/prisma';
import { initializeUserNotificationPreferences } from '../src/services/notificationPreference.service';

const BOOTSTRAP_LOCK_KEY = 4_420_001;

const required = (name: string) => {
  const value = (process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const main = async () => {
  const email = required('SUPERADMIN_EMAIL').toLowerCase();
  const name = required('SUPERADMIN_NAME');
  const password = required('SUPERADMIN_PASSWORD');
  const mobile = (process.env.SUPERADMIN_MOBILE || '').replace(/\D/g, '') || undefined;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('SUPERADMIN_EMAIL is not a valid email address.');
  if (password.length < 12) throw new Error('SUPERADMIN_PASSWORD must be at least 12 characters.');

  const hashedPassword = await bcrypt.hash(password, 10);

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`;

    const existing = await tx.user.count({ where: { role: 'SUPER_ADMIN' } });
    if (existing > 0) {
      throw new Error(`A super admin already exists (${existing}). Add more admins from the admin portal instead.`);
    }
    const sameEmail = await tx.user.findUnique({ where: { email } });
    if (sameEmail) {
      throw new Error(`An account with ${email} already exists. Use a different email.`);
    }

    const user = await tx.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        mobile,
        authProvider: 'LOCAL',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        adminProfile: { create: { title: 'Platform Super Admin', isRootAdmin: true } },
      } as any,
    });
    await initializeUserNotificationPreferences(user, tx as any);
    return user;
  });

  console.log(`Root super admin created: ${created.email} (id ${created.id}). Sign in at /login.`);
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
