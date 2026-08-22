"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const prisma_1 = __importDefault(require("../src/lib/prisma"));
const categoryIconMapping = {
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
        const categoriesFilePath = node_path_1.default.join(__dirname, '../../categories.json');
        const categoriesData = node_fs_1.default.readFileSync(categoriesFilePath, 'utf-8');
        const categories = JSON.parse(categoriesData);
        console.log(`Found ${categories.length} categories to seed.`);
        const icons = await prisma_1.default.categoryIcon.findMany({
            select: {
                id: true,
                name: true,
            },
        });
        const iconsByName = new Map(icons.map((icon) => [icon.name.trim().toLowerCase(), icon]));
        for (const categoryName of categories) {
            const mappedIconName = categoryIconMapping[categoryName];
            const mappedIcon = mappedIconName
                ? iconsByName.get(mappedIconName.trim().toLowerCase())
                : null;
            const existingCategory = await prisma_1.default.category.findFirst({
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
                await prisma_1.default.category.create({
                    data: {
                        name: categoryName,
                        iconId: mappedIcon?.id ?? null,
                    },
                });
                console.log(`- Created global category: ${categoryName}${mappedIcon ? ` -> ${mappedIcon.name}` : ''}`);
            }
            else {
                await prisma_1.default.category.update({
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
    }
    catch (error) {
        console.error('Error seeding categories:', error);
        process.exit(1);
    }
    finally {
        await prisma_1.default.$disconnect();
    }
}
void main();
//# sourceMappingURL=seed-categories.js.map