import prisma from './src/lib/prisma';

async function main() {
  const count = await prisma.user.count({
    where: {
      role: 'PARTNER',
      partnerProfile: {
        kycStatus: 'APPROVED'
      }
    }
  });
  console.log('Count:', count);
}

main().catch(console.error).finally(() => process.exit(0));
