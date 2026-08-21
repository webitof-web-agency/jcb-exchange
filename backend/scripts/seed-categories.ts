import prisma from '../src/lib/prisma';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('Starting category seed...');

  try {
    // Read the categories.json file from the root directory
    const categoriesFilePath = path.join(__dirname, '../../categories.json');
    const categoriesData = fs.readFileSync(categoriesFilePath, 'utf-8');
    const categories: string[] = JSON.parse(categoriesData);

    console.log(`Found ${categories.length} categories to seed.`);

    // Check and create each category to ensure no duplicates for global categories (partnerProfileId = null)
    for (const categoryName of categories) {
      const existingCategory = await prisma.category.findFirst({
        where: {
          name: categoryName,
          partnerProfileId: null, // Global category
        },
      });

      if (!existingCategory) {
        await prisma.category.create({
          data: {
            name: categoryName,
            // partnerProfileId remains null by default
          },
        });
        console.log(`- Created global category: ${categoryName}`);
      } else {
        console.log(`- Global category already exists: ${categoryName}`);
      }
    }

    console.log('✅ Category seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding categories:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
