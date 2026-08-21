"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("./src/lib/prisma"));
async function main() {
    const docs = await prisma_1.default.kycDocument.findMany({
        where: { partnerProfileId: '9b69f5e7-3649-45fa-874c-9c0750d9c164' }
    });
    console.log(JSON.stringify(docs, null, 2));
}
main().finally(() => prisma_1.default.$disconnect());
//# sourceMappingURL=check_db.js.map