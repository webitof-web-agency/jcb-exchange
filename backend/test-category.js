"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("./src/lib/prisma"));
async function main() {
    const cats = await prisma_1.default.category.findMany();
    console.log('Categories in DB:', cats.map(c => c.name));
}
main().catch(console.error).finally(() => prisma_1.default.$disconnect());
//# sourceMappingURL=test-category.js.map