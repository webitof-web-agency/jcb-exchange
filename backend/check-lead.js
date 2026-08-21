const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
async function main() { 
  const lead = await prisma.lead.findUnique({ where: { id: 'e20bc617-0875-4d33-9d9e-c85191ce7d68' } }); 
  console.log(lead); 
} 
main().catch(console.error).finally(() => prisma.$disconnect());
