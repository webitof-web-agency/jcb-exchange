import prisma from './src/lib/prisma';

async function main() {
  // Find categories named 'Uncategorized'
  const categories = await prisma.category.findMany({
    where: {
      name: {
        equals: 'Uncategorized',
        mode: 'insensitive' // To catch any case variants like 'uncategorized'
      }
    }
  });

  if (categories.length === 0) {
    console.log("No 'Uncategorized' categories found.");
    return;
  }

  const categoryIds = categories.map(c => c.id);
  console.log("Found Uncategorized category IDs:", categoryIds);

  // First delete associated listings to prevent foreign key constraint failures
  const deletedListings = await prisma.listing.deleteMany({
    where: {
      categoryId: {
        in: categoryIds
      }
    }
  });
  console.log(`Successfully deleted ${deletedListings.count} listings.`);

  // Now delete the categories
  const deletedCategories = await prisma.category.deleteMany({
    where: {
      id: {
        in: categoryIds
      }
    }
  });
  console.log(`Successfully deleted ${deletedCategories.count} 'Uncategorized' categories.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
