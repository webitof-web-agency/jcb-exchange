import prisma from './src/lib/prisma';

async function main() {
  const partners = await prisma.partnerProfile.findMany({
    select: {
      id: true,
      businessName: true,
      accountStatus: true,
      onboardingStatus: true,
    }
  });
  console.log(JSON.stringify(partners, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
