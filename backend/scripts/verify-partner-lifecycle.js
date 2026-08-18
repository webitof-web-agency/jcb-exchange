"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = __importDefault(require("../src/lib/prisma"));
const auth_controller_1 = require("../src/controllers/auth.controller");
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
const runController = async (handler, req) => {
    const res = createMockResponse();
    await handler(req, res, (error) => {
        if (error) {
            throw error;
        }
    });
    return res;
};
const testPrefix = `partner-lifecycle-${Date.now()}`;
const password = 'Partner123!';
const mobileFor = (index) => `9${String(Date.now()).slice(-8)}${index}`.slice(0, 10);
const cleanupByEmailPrefix = async () => {
    const users = await prisma_1.default.user.findMany({
        where: {
            email: {
                startsWith: testPrefix,
            },
        },
        include: {
            partnerProfile: {
                select: {
                    id: true,
                },
            },
        },
    });
    for (const user of users) {
        const partnerProfileId = user.partnerProfile?.id;
        await prisma_1.default.notification.deleteMany({ where: { userId: user.id } });
        await prisma_1.default.lead.deleteMany({
            where: {
                OR: [{ customerId: user.id }, { dealerId: user.id }],
            },
        });
        await prisma_1.default.media.deleteMany({
            where: {
                listing: {
                    partnerId: user.id,
                },
            },
        });
        await prisma_1.default.listing.deleteMany({ where: { partnerId: user.id } });
        if (partnerProfileId) {
            await prisma_1.default.partnerAgreement.deleteMany({ where: { partnerProfileId } });
            await prisma_1.default.partnerDeposit.deleteMany({ where: { partnerProfileId } });
            await prisma_1.default.kycReviewLog.deleteMany({ where: { partnerProfileId } });
            await prisma_1.default.kycDocument.deleteMany({ where: { partnerProfileId } });
            await prisma_1.default.partnerTeamMember.deleteMany({ where: { partnerProfileId } });
            await prisma_1.default.partnerProfile.deleteMany({ where: { userId: user.id } });
        }
        await prisma_1.default.adminPermission.deleteMany({ where: { adminUserId: user.id } });
        await prisma_1.default.adminProfile.deleteMany({ where: { userId: user.id } });
        await prisma_1.default.kycReviewLog.deleteMany({ where: { actorUserId: user.id } });
        await prisma_1.default.user.deleteMany({ where: { id: user.id } });
    }
};
async function verifySuperAdminCreatedPartner() {
    const email = `${testPrefix}-superadmin-created@example.com`;
    const res = await runController(admin_controller_1.createManagedUser, {
        body: {
            name: 'Lifecycle Superadmin Partner',
            email,
            mobile: mobileFor(1),
            password,
            role: 'PARTNER',
        },
        user: null,
    });
    strict_1.default.equal(res.statusCode, 201);
    strict_1.default.equal(res.body.user.role, 'CUSTOMER');
    strict_1.default.equal(res.body.user.onboardingStatus, 'PROFILE_PENDING');
    strict_1.default.equal(res.body.user.accountStatus, 'PENDING');
    strict_1.default.equal(res.body.user.kycStatus, 'NOT_STARTED');
    const profile = await prisma_1.default.partnerProfile.findUnique({
        where: { userId: res.body.user.id },
    });
    strict_1.default.ok(profile, 'Superadmin-created partner should have a profile.');
    strict_1.default.equal(profile?.businessName, 'Lifecycle Superadmin Partner');
}
async function verifySelfRegisteredPartner() {
    const email = `${testPrefix}-self-register@example.com`;
    const res = await runController(auth_controller_1.register, {
        body: {
            name: 'Lifecycle Self Partner',
            email,
            mobile: mobileFor(2),
            password,
        },
    });
    strict_1.default.equal(res.statusCode, 200);
    strict_1.default.equal(res.body.user.role, 'CUSTOMER');
    strict_1.default.equal(res.body.user.onboardingStatus, undefined);
    strict_1.default.equal(res.body.user.accountStatus, undefined);
    strict_1.default.equal(res.body.user.kycStatus, undefined);
    const context = await (0, auth_controller_1.getPartnerOnboardingContext)(res.body.user.id);
    strict_1.default.ok(context?.partnerProfile, 'Customer should receive a partner profile when they enter onboarding.');
    const payload = await (0, auth_controller_1.buildAuthUserPayload)(context);
    strict_1.default.equal(payload.role, 'CUSTOMER');
    strict_1.default.equal(payload.onboardingStatus, 'PROFILE_PENDING');
    strict_1.default.equal(payload.accountStatus, 'PENDING');
    strict_1.default.equal(payload.kycStatus, 'NOT_STARTED');
}
async function verifyMissingProfileRecovery() {
    const email = `${testPrefix}-missing-profile@example.com`;
    const user = await prisma_1.default.user.create({
        data: {
            email,
            name: 'Lifecycle Missing Profile',
            password: await bcryptjs_1.default.hash(password, 10),
            role: 'PARTNER',
            status: 'ACTIVE',
            authProvider: 'LOCAL',
        },
    });
    const context = await (0, auth_controller_1.getPartnerOnboardingContext)(user.id);
    strict_1.default.ok(context?.partnerProfile, 'Missing partner profile should be created on demand.');
    strict_1.default.equal(context.partnerProfile.onboardingStatus, 'PROFILE_PENDING');
    strict_1.default.equal(context.partnerProfile.accountStatus, 'PENDING');
    strict_1.default.equal(context.partnerProfile.kycStatus, 'NOT_STARTED');
    const payload = await (0, auth_controller_1.buildAuthUserPayload)(user);
    strict_1.default.equal(payload.role, 'PARTNER');
    strict_1.default.equal(payload.onboardingStatus, 'PROFILE_PENDING');
}
async function verifyApprovedLoginAndReactivation() {
    const email = `${testPrefix}-approved@example.com`;
    const user = await prisma_1.default.user.create({
        data: {
            email,
            name: 'Lifecycle Approved Partner',
            password: await bcryptjs_1.default.hash(password, 10),
            role: 'PARTNER',
            status: 'ACTIVE',
            authProvider: 'LOCAL',
            partnerProfile: {
                create: {
                    ownerName: 'Lifecycle Approved Partner',
                    businessName: 'Lifecycle Approved Dealer',
                    partnerType: 'BROKER',
                    onboardingStatus: 'APPROVED',
                    accountStatus: 'ACTIVE',
                    kycStatus: 'APPROVED',
                    listingLimit: 5,
                },
            },
        },
    });
    const loginRes = await runController(auth_controller_1.login, {
        body: {
            email,
            password,
        },
    });
    strict_1.default.equal(loginRes.statusCode, 200);
    strict_1.default.equal(loginRes.body.user.role, 'PARTNER');
    strict_1.default.equal(loginRes.body.user.accountStatus, 'ACTIVE');
    strict_1.default.equal(loginRes.body.user.onboardingStatus, 'APPROVED');
    strict_1.default.equal(loginRes.body.user.kycStatus, 'APPROVED');
    strict_1.default.equal(loginRes.body.user.partnerType, 'BROKER');
    const inactiveRes = await runController(admin_controller_1.updateAdminUserStatus, {
        params: { id: user.id },
        body: { status: 'INACTIVE' },
        user: null,
    });
    strict_1.default.equal(inactiveRes.statusCode, 200);
    strict_1.default.equal(inactiveRes.body.user.status, 'INACTIVE');
    strict_1.default.equal(inactiveRes.body.user.accountStatus, 'ACTIVE');
    strict_1.default.equal(inactiveRes.body.user.onboardingStatus, 'APPROVED');
    strict_1.default.equal(inactiveRes.body.user.kycStatus, 'APPROVED');
    const activeRes = await runController(admin_controller_1.updateAdminUserStatus, {
        params: { id: user.id },
        body: { status: 'ACTIVE' },
        user: null,
    });
    strict_1.default.equal(activeRes.statusCode, 200);
    strict_1.default.equal(activeRes.body.user.status, 'ACTIVE');
    strict_1.default.equal(activeRes.body.user.accountStatus, 'ACTIVE');
    strict_1.default.equal(activeRes.body.user.onboardingStatus, 'APPROVED');
    strict_1.default.equal(activeRes.body.user.kycStatus, 'APPROVED');
}
async function verifyCustomerApplicantPromotionOnApproval() {
    const email = `${testPrefix}-customer-promotion@example.com`;
    const reviewer = await prisma_1.default.user.create({
        data: {
            email: `${testPrefix}-reviewer@example.com`,
            name: 'Lifecycle Reviewer',
            password: await bcryptjs_1.default.hash(password, 10),
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            authProvider: 'LOCAL',
            adminProfile: {
                create: {
                    title: 'Lifecycle Reviewer',
                    isRootAdmin: false,
                },
            },
        },
    });
    const createRes = await runController(admin_controller_1.createManagedUser, {
        body: {
            name: 'Lifecycle Customer Applicant',
            email,
            mobile: mobileFor(4),
            password,
            role: 'PARTNER',
            businessName: 'Lifecycle Applicant Dealer',
            partnerType: 'BROKER',
        },
        user: null,
    });
    strict_1.default.equal(createRes.statusCode, 201);
    strict_1.default.equal(createRes.body.user.role, 'CUSTOMER');
    strict_1.default.equal(createRes.body.user.kycStatus, 'NOT_STARTED');
    const approveRes = await runController(admin_controller_1.updateVerificationStatus, {
        params: { id: createRes.body.user.id },
        body: { status: 'APPROVED' },
        user: { id: reviewer.id, role: 'SUPER_ADMIN' },
    });
    strict_1.default.equal(approveRes.statusCode, 200);
    const promotedUser = await prisma_1.default.user.findUnique({
        where: { id: createRes.body.user.id },
        include: { partnerProfile: true },
    });
    strict_1.default.equal(promotedUser?.role, 'PARTNER');
    strict_1.default.equal(promotedUser.partnerProfile?.accountStatus, 'ACTIVE');
    strict_1.default.equal(promotedUser.partnerProfile?.onboardingStatus, 'APPROVED');
    strict_1.default.equal(promotedUser.partnerProfile?.kycStatus, 'APPROVED');
    const loginRes = await runController(auth_controller_1.login, {
        body: {
            email,
            password,
        },
    });
    strict_1.default.equal(loginRes.statusCode, 200);
    strict_1.default.equal(loginRes.body.user.role, 'PARTNER');
    strict_1.default.equal(loginRes.body.user.accountStatus, 'ACTIVE');
    strict_1.default.equal(loginRes.body.user.onboardingStatus, 'APPROVED');
    strict_1.default.equal(loginRes.body.user.kycStatus, 'APPROVED');
}
async function main() {
    try {
        await cleanupByEmailPrefix();
        await verifySuperAdminCreatedPartner();
        await verifySelfRegisteredPartner();
        await verifyMissingProfileRecovery();
        await verifyApprovedLoginAndReactivation();
        await verifyCustomerApplicantPromotionOnApproval();
        console.log('Partner lifecycle verification passed.');
    }
    finally {
        await cleanupByEmailPrefix();
    }
}
main()
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma_1.default.$disconnect();
});
//# sourceMappingURL=verify-partner-lifecycle.js.map