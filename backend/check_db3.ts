import prismaAny from './src/lib/prisma';
async function main() {
  const profile = await prismaAny.partnerProfile.findFirst({
    where: { businessName: 'Amar' },
    include: { user: true }
  });
  console.log(JSON.stringify(profile?.user ?? null, null, 2));
}
main().finally(() => prismaAny.$disconnect());
