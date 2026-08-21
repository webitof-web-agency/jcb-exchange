"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("./src/lib/prisma"));
async function main() {
    const profile = await prisma_1.default.partnerProfile.findFirst({
        where: { businessName: 'Amar' }
    });
    console.log('businessLogoUrl:', profile.businessLogoUrl);
}
main().finally(() => prisma_1.default.$disconnect());
//# sourceMappingURL=check_db2.js.map