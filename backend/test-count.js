"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("./src/lib/prisma"));
async function main() {
    const count = await prisma_1.default.user.count({
        where: {
            role: 'PARTNER',
            partnerProfile: {
                kycStatus: 'APPROVED'
            }
        }
    });
    console.log('Count:', count);
}
main().catch(console.error).finally(() => process.exit(0));
//# sourceMappingURL=test-count.js.map