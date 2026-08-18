"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const prisma_1 = __importDefault(require("../src/lib/prisma"));
const admin_controller_1 = require("../src/controllers/admin.controller");
const createMockResponse = () => ({
    statusCode: 200,
    body: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.body = payload;
        return this;
    },
});
async function main() {
    const partner = await prisma_1.default.user.findFirst({
        where: {
            role: 'PARTNER',
            partnerProfile: {
                is: {
                    onboardingStatus: 'APPROVED',
                    kycStatus: 'APPROVED',
                },
            },
        },
        include: {
            partnerProfile: {
                select: {
                    accountStatus: true,
                    onboardingStatus: true,
                    kycStatus: true,
                },
            },
        },
        orderBy: {
            createdAt: 'asc',
        },
    });
    strict_1.default.ok(partner, 'Expected at least one approved partner for verification.');
    strict_1.default.ok(partner.partnerProfile, 'Approved partner must have a partner profile.');
    const originalUserStatus = partner.status;
    const originalAccountStatus = partner.partnerProfile.accountStatus;
    try {
        const inactiveReq = {
            params: { id: partner.id },
            body: { status: 'INACTIVE' },
            user: { id: 'verification-script' },
        };
        const inactiveRes = createMockResponse();
        await (0, admin_controller_1.updateAdminUserStatus)(inactiveReq, inactiveRes, (error) => {
            if (error) {
                throw error;
            }
        });
        strict_1.default.equal(inactiveRes.statusCode, 200, 'Inactive update should succeed.');
        const inactiveUser = inactiveRes.body?.user;
        strict_1.default.equal(inactiveUser.status, 'INACTIVE', 'User status should become INACTIVE.');
        strict_1.default.equal(inactiveUser.accountStatus, 'ACTIVE', 'Approved partner account status should stay ACTIVE while inactive.');
        const activeReq = {
            params: { id: partner.id },
            body: { status: 'ACTIVE' },
            user: { id: 'verification-script' },
        };
        const activeRes = createMockResponse();
        await (0, admin_controller_1.updateAdminUserStatus)(activeReq, activeRes, (error) => {
            if (error) {
                throw error;
            }
        });
        strict_1.default.equal(activeRes.statusCode, 200, 'Active update should succeed.');
        const activeUser = activeRes.body?.user;
        strict_1.default.equal(activeUser.status, 'ACTIVE', 'User status should become ACTIVE again.');
        strict_1.default.equal(activeUser.accountStatus, 'ACTIVE', 'Approved partner account status should remain ACTIVE after reactivation.');
        strict_1.default.equal(activeUser.kycStatus, 'APPROVED', 'KYC approval should remain intact.');
        strict_1.default.equal(activeUser.onboardingStatus, 'APPROVED', 'Onboarding approval should remain intact.');
        console.log(`Partner reactivation verification passed for ${partner.id}.`);
    }
    finally {
        await prisma_1.default.user.update({
            where: { id: partner.id },
            data: { status: originalUserStatus },
        });
        await prisma_1.default.partnerProfile.update({
            where: { userId: partner.id },
            data: { accountStatus: originalAccountStatus },
        });
    }
}
main()
    .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma_1.default.$disconnect();
});
//# sourceMappingURL=verify-approved-partner-reactivation.js.map