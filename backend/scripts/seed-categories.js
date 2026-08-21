"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("../src/lib/prisma"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
async function main() {
    console.log('Starting category seed...');
    try {
        // Read the categories.json file from the root directory
        const categoriesFilePath = path_1.default.join(__dirname, '../../categories.json');
        const categoriesData = fs_1.default.readFileSync(categoriesFilePath, 'utf-8');
        const categories = JSON.parse(categoriesData);
        console.log(`Found ${categories.length} categories to seed.`);
        // Check and create each category to ensure no duplicates for global categories (partnerProfileId = null)
        for (const categoryName of categories) {
            const existingCategory = await prisma_1.default.category.findFirst({
                where: {
                    name: categoryName,
                    partnerProfileId: null, // Global category
                },
            });
            if (!existingCategory) {
                await prisma_1.default.category.create({
                    data: {
                        name: categoryName,
                        // partnerProfileId remains null by default
                    },
                });
                console.log(`- Created global category: ${categoryName}`);
            }
            else {
                console.log(`- Global category already exists: ${categoryName}`);
            }
        }
        console.log('✅ Category seeding completed successfully!');
    }
    catch (error) {
        console.error('❌ Error seeding categories:', error);
        process.exit(1);
    }
    finally {
        await prisma_1.default.$disconnect();
    }
}
main();
//# sourceMappingURL=seed-categories.js.map