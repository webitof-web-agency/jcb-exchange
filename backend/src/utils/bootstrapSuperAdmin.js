"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureBootstrapSuperAdmin = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const ensureBootstrapSuperAdmin = async () => {
    const superAdminCount = await prisma_1.default.user.count({
        where: { role: 'SUPER_ADMIN' },
    });
    if (superAdminCount > 0) {
        return true;
    }
    const legacyAdmin = await prisma_1.default.user.findFirst({
        where: { role: 'ADMIN' },
        orderBy: { createdAt: 'asc' },
    });
    if (!legacyAdmin) {
        return false;
    }
    await prisma_1.default.user.update({
        where: { id: legacyAdmin.id },
        data: {
            role: 'SUPER_ADMIN',
            adminProfile: {
                upsert: {
                    create: {
                        title: 'Platform Super Admin',
                        isRootAdmin: true,
                    },
                    update: {
                        isRootAdmin: true,
                    },
                },
            },
        },
    });
    return true;
};
exports.ensureBootstrapSuperAdmin = ensureBootstrapSuperAdmin;
//# sourceMappingURL=bootstrapSuperAdmin.js.map