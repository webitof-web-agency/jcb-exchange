import prisma from '../src/lib/prisma';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('Starting brand seed...');

  try {
    // Read the brands.json file from the root directory
    const brandsFilePath = path.join(__dirname, '../../brands.json');
    const brandsData = fs.readFileSync(brandsFilePath, 'utf-8');
    const brands: string[] = JSON.parse(brandsData);

    console.log(`Found ${brands.length} brands to seed.`);

    // Upsert each brand to ensure no duplicates
    for (const brandName of brands) {
      await prisma.brand.upsert({
        where: { name: brandName },
        update: {}, // Do nothing if it already exists
        create: { name: brandName },
      });
      console.log(`- Upserted brand: ${brandName}`);
    }

    console.log('✅ Brand seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding brands:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
