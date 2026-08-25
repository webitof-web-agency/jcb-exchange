import prismaAny from './src/lib/prisma';
async function main() {
  const profile = await prismaAny.partnerProfile.findFirst({
    where: { businessName: 'Amar' }
  });
  console.log('businessLogoUrl:', profile?.businessLogoUrl ?? null);
}
main().finally(() => prismaAny.$disconnect());
