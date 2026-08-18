import prisma from '../lib/prisma';

export const ensureBootstrapSuperAdmin = async () => {
  const superAdminCount = await prisma.user.count({
    where: { role: 'SUPER_ADMIN' },
  });

  if (superAdminCount > 0) {
    return true;
  }

  const legacyAdmin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
  });

  if (!legacyAdmin) {
    return false;
  }

  await prisma.user.update({
    where: { id: legacyAdmin.id },
    data: {
      role: 'SUPER_ADMIN',
      adminProfile: {
        upsert: {
          create: {
            title: 'Platform Super Admin',
            isRootAdmin: true,
          },
          update: {
            isRootAdmin: true,
          },
        },
      },
    },
  });

  return true;
};
