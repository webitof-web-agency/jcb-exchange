import prisma from './src/lib/prisma';

async function main() {
  const cats = await prisma.category.findMany();
  console.log('Categories in DB:', cats.map(c => c.name));
}

main().catch(console.error).finally(() => prisma.$disconnect());
