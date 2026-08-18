"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("./src/lib/prisma"));
async function main() {
    const partners = await prisma_1.default.partnerProfile.findMany({
        select: {
            id: true,
            businessName: true,
            accountStatus: true,
            onboardingStatus: true,
        }
    });
    console.log(JSON.stringify(partners, null, 2));
}
main()
    .catch(e => console.error(e))
    .finally(async () => {
    await prisma_1.default.$disconnect();
});
//# sourceMappingURL=test-partners.js.map