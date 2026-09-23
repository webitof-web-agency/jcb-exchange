const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const mobile = '8770489813';
  const user = await p.user.findFirst({
    where: {
      OR: [
        { mobile: mobile },
        { mobile: `91${mobile}` },
        { mobile: `0${mobile}` },
      ],
    },
    select: { id: true, mobile: true, email: true, name: true, role: true },
  });
  console.log('USER FOUND:', JSON.stringify(user));

  // Also check what mobile formats exist for recently created users
  const recentUsers = await p.user.findMany({
    where: {
      mobile: { not: null },
    },
    select: { id: true, mobile: true, email: true, name: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('RECENT USERS WITH MOBILE:', JSON.stringify(recentUsers, null, 2));
}

main().catch(console.error).finally(() => p.$disconnect());
