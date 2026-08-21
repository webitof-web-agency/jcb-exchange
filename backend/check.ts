import prisma from './src/lib/prisma';

async function main() {
  const leadId = 'e20bc617-0875-4d33-9d9e-c85191ce7d68';
  console.log(`Checking lead with ID: ${leadId}`);
  
  const lead = await (prisma as any).lead.findUnique({
    where: { id: leadId },
  });
  
  console.log('Unique search result:', lead);
  
  const allLeads = await (prisma as any).lead.findMany({
    take: 5,
    select: { id: true, status: true }
  });
  
  console.log('First 5 leads in DB:', allLeads);
}

main().catch(console.error).finally(() => (prisma as any).$disconnect());
