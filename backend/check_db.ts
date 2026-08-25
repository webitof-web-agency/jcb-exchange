import prismaAny from './src/lib/prisma';
async function main() {
  console.log('Database helper test OK');
}
main().finally(() => prismaAny.$disconnect());
