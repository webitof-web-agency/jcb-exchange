"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("../src/lib/prisma"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
async function main() {
    console.log('Starting brand seed...');
    try {
        // Read the brands.json file from the root directory
        const brandsFilePath = path_1.default.join(__dirname, '../../brands.json');
        const brandsData = fs_1.default.readFileSync(brandsFilePath, 'utf-8');
        const brands = JSON.parse(brandsData);
        console.log(`Found ${brands.length} brands to seed.`);
        // Upsert each brand to ensure no duplicates
        for (const brandName of brands) {
            await prisma_1.default.brand.upsert({
                where: { name: brandName },
                update: {}, // Do nothing if it already exists
                create: { name: brandName },
            });
            console.log(`- Upserted brand: ${brandName}`);
        }
        console.log('✅ Brand seeding completed successfully!');
    }
    catch (error) {
        console.error('❌ Error seeding brands:', error);
        process.exit(1);
    }
    finally {
        await prisma_1.default.$disconnect();
    }
}
main();
//# sourceMappingURL=seed-brands.js.map