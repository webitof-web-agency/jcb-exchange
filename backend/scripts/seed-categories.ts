import fs from 'node:fs';
import path from 'node:path';
import prisma from '../src/lib/prisma';

const categoryIconMapping: Record<string, string> = {
  'Backhoe Loader': 'Container 2',
  Excavator: 'Excavator',
  'Wheel Loader': 'Container',
  Telehandler: 'Container 8',
  'Skid Steer Loader': 'Container 3',
  'Compactor / Road Roller': 'Container 7',
  'Motor Grader': 'Container 11',
  Bulldozer: 'Container 5',
  'Dump Truck / Tipper': 'Truck',
  Crane: 'Crane',
  Forklift: 'Container 9',
  Paver: 'Container 6',
  Tractor: 'Tractor',
};

async function main() {
  console.log('Starting category seed...');

  try {
    const categoriesFilePath = path.join(__dirname, '../../categories.json');
    const categoriesData = fs.readFileSync(categoriesFilePath, 'utf-8');
    const categories: string[] = JSON.parse(categoriesData);

    console.log(`Found ${categories.length} categories to seed.`);

    const icons = await prisma.categoryIcon.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    const iconsByName = new Map(
      icons.map((icon) => [icon.name.trim().toLowerCase(), icon])
    );

    for (const categoryName of categories) {
      const mappedIconName = categoryIconMapping[categoryName];
      const mappedIcon = mappedIconName
        ? iconsByName.get(mappedIconName.trim().toLowerCase())
        : null;

      const existingCategory = await prisma.category.findFirst({
        where: {
          name: categoryName,
          partnerProfileId: null,
        },
        select: {
          id: true,
          iconId: true,
        },
      });

      if (!existingCategory) {
        await prisma.category.create({
          data: {
            name: categoryName,
            iconId: mappedIcon?.id ?? null,
          },
        });
        console.log(`- Created global category: ${categoryName}${mappedIcon ? ` -> ${mappedIcon.name}` : ''}`);
      } else {
        await prisma.category.update({
          where: { id: existingCategory.id },
          data: {
            iconId: mappedIcon?.id ?? existingCategory.iconId ?? null,
          },
        });
        console.log(`- Updated global category: ${categoryName}${mappedIcon ? ` -> ${mappedIcon.name}` : ''}`);
      }

      if (mappedIconName && !mappedIcon) {
        console.warn(`Warning: icon "${mappedIconName}" not found for category "${categoryName}"`);
      }
    }

    console.log('Category seeding completed successfully.');
  } catch (error) {
    console.error('Error seeding categories:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
