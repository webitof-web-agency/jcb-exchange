"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("./src/lib/prisma"));
async function main() {
    const profiles = await prisma_1.default.partnerProfile.findMany({
        select: { businessName: true, yearsInBusiness: true }
    });
    console.log(profiles);
}
main().catch(console.error).finally(() => prisma_1.default.$disconnect());
//# sourceMappingURL=scratch_ts.js.map