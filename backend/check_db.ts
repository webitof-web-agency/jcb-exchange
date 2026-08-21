import prismaAny from './src/lib/prisma';
async function main() {
  const docs = await prismaAny.kycDocument.findMany({
    where: { partnerProfileId: '9b69f5e7-3649-45fa-874c-9c0750d9c164' }
  });
  console.log(JSON.stringify(docs, null, 2));
}
main().finally(() => prismaAny.$disconnect());
