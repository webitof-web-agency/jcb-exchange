import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import prisma from '../src/lib/prisma';
import {
  buildAuthUserPayload,
  getPartnerOnboardingContext,
  login,
  register,
} from '../src/controllers/auth.controller';
import {
  createManagedUser,
  updateVerificationStatus,
  updateAdminUserStatus,
} from '../src/controllers/admin.controller';

type MockResponse = {
  statusCode: number;
  body: any;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
};

const createMockResponse = (): MockResponse => ({
  statusCode: 200,
  body: null,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(payload: unknown) {
    this.body = payload;
    return this;
  },
});

const runController = async (
  handler: (req: any, res: any, next: (error?: unknown) => void) => Promise<unknown>,
  req: any,
) => {
  const res = createMockResponse();
  await handler(req, res, (error?: unknown) => {
    if (error) {
      throw error;
    }
  });
  return res;
};

const testPrefix = `partner-lifecycle-${Date.now()}`;
const password = 'Partner123!';
const mobileFor = (index: number) => `9${String(Date.now()).slice(-8)}${index}`.slice(0, 10);

const cleanupByEmailPrefix = async () => {
  const users = await prisma.user.findMany({
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
    const partnerProfileId = (user as any).partnerProfile?.id;

    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.lead.deleteMany({
      where: {
        OR: [{ customerId: user.id }, { dealerId: user.id }],
      },
    });
    await prisma.media.deleteMany({
      where: {
        listing: {
          partnerId: user.id,
        },
      },
    });
    await prisma.listing.deleteMany({ where: { partnerId: user.id } });

    if (partnerProfileId) {
      await prisma.partnerAgreement.deleteMany({ where: { partnerProfileId } });
      await prisma.partnerDeposit.deleteMany({ where: { partnerProfileId } });
      await prisma.kycReviewLog.deleteMany({ where: { partnerProfileId } });
      await prisma.kycDocument.deleteMany({ where: { partnerProfileId } });
      await prisma.partnerTeamMember.deleteMany({ where: { partnerProfileId } });
      await prisma.partnerProfile.deleteMany({ where: { userId: user.id } });
    }

    await prisma.adminPermission.deleteMany({ where: { adminUserId: user.id } });
    await prisma.adminProfile.deleteMany({ where: { userId: user.id } });
    await prisma.kycReviewLog.deleteMany({ where: { actorUserId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
};

async function verifySuperAdminCreatedPartner() {
  const email = `${testPrefix}-superadmin-created@example.com`;

  const res = await runController(createManagedUser, {
    body: {
      name: 'Lifecycle Superadmin Partner',
      email,
      mobile: mobileFor(1),
      password,
      role: 'PARTNER',
    },
    user: null,
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.role, 'CUSTOMER');
  assert.equal(res.body.user.onboardingStatus, 'PROFILE_PENDING');
  assert.equal(res.body.user.accountStatus, 'PENDING');
  assert.equal(res.body.user.kycStatus, 'NOT_STARTED');

  const profile = await prisma.partnerProfile.findUnique({
    where: { userId: res.body.user.id },
  });

  assert.ok(profile, 'Superadmin-created partner should have a profile.');
  assert.equal(profile?.businessName, 'Lifecycle Superadmin Partner');
}

async function verifySelfRegisteredPartner() {
  const email = `${testPrefix}-self-register@example.com`;

  const res = await runController(register, {
    body: {
      name: 'Lifecycle Self Partner',
      email,
      mobile: mobileFor(2),
      password,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.role, 'CUSTOMER');
  assert.equal(res.body.user.onboardingStatus, undefined);
  assert.equal(res.body.user.accountStatus, undefined);
  assert.equal(res.body.user.kycStatus, undefined);

  const context = await getPartnerOnboardingContext(res.body.user.id);
  assert.ok(context?.partnerProfile, 'Customer should receive a partner profile when they enter onboarding.');

  const payload = await buildAuthUserPayload(context);
  assert.equal(payload.role, 'CUSTOMER');
  assert.equal((payload as any).onboardingStatus, 'PROFILE_PENDING');
  assert.equal((payload as any).accountStatus, 'PENDING');
  assert.equal((payload as any).kycStatus, 'NOT_STARTED');
}

async function verifyMissingProfileRecovery() {
  const email = `${testPrefix}-missing-profile@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Lifecycle Missing Profile',
      password: await bcrypt.hash(password, 10),
      role: 'PARTNER',
      status: 'ACTIVE',
      authProvider: 'LOCAL',
    },
  });

  const context = await getPartnerOnboardingContext(user.id);
  assert.ok(context?.partnerProfile, 'Missing partner profile should be created on demand.');
  assert.equal(context.partnerProfile.onboardingStatus, 'PROFILE_PENDING');
  assert.equal(context.partnerProfile.accountStatus, 'PENDING');
  assert.equal(context.partnerProfile.kycStatus, 'NOT_STARTED');

  const payload = await buildAuthUserPayload(user);
  assert.equal(payload.role, 'PARTNER');
  assert.equal((payload as any).onboardingStatus, 'PROFILE_PENDING');
}

async function verifyApprovedLoginAndReactivation() {
  const email = `${testPrefix}-approved@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Lifecycle Approved Partner',
      password: await bcrypt.hash(password, 10),
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
    } as any,
  });

  const loginRes = await runController(login, {
    body: {
      email,
      password,
    },
  });

  assert.equal(loginRes.statusCode, 200);
  assert.equal(loginRes.body.user.role, 'PARTNER');
  assert.equal(loginRes.body.user.accountStatus, 'ACTIVE');
  assert.equal(loginRes.body.user.onboardingStatus, 'APPROVED');
  assert.equal(loginRes.body.user.kycStatus, 'APPROVED');
  assert.equal(loginRes.body.user.partnerType, 'BROKER');

  const inactiveRes = await runController(updateAdminUserStatus, {
    params: { id: user.id },
    body: { status: 'INACTIVE' },
    user: null,
  });

  assert.equal(inactiveRes.statusCode, 200);
  assert.equal(inactiveRes.body.user.status, 'INACTIVE');
  assert.equal(inactiveRes.body.user.accountStatus, 'ACTIVE');
  assert.equal(inactiveRes.body.user.onboardingStatus, 'APPROVED');
  assert.equal(inactiveRes.body.user.kycStatus, 'APPROVED');

  const activeRes = await runController(updateAdminUserStatus, {
    params: { id: user.id },
    body: { status: 'ACTIVE' },
    user: null,
  });

  assert.equal(activeRes.statusCode, 200);
  assert.equal(activeRes.body.user.status, 'ACTIVE');
  assert.equal(activeRes.body.user.accountStatus, 'ACTIVE');
  assert.equal(activeRes.body.user.onboardingStatus, 'APPROVED');
  assert.equal(activeRes.body.user.kycStatus, 'APPROVED');
}

async function verifyCustomerApplicantPromotionOnApproval() {
  const email = `${testPrefix}-customer-promotion@example.com`;
  const reviewer = await prisma.user.create({
    data: {
      email: `${testPrefix}-reviewer@example.com`,
      name: 'Lifecycle Reviewer',
      password: await bcrypt.hash(password, 10),
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      authProvider: 'LOCAL',
      adminProfile: {
        create: {
          title: 'Lifecycle Reviewer',
          isRootAdmin: false,
        },
      },
    } as any,
  });

  const createRes = await runController(createManagedUser, {
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

  assert.equal(createRes.statusCode, 201);
  assert.equal(createRes.body.user.role, 'CUSTOMER');
  assert.equal(createRes.body.user.kycStatus, 'NOT_STARTED');

  const approveRes = await runController(updateVerificationStatus, {
    params: { id: createRes.body.user.id },
    body: { status: 'APPROVED' },
    user: { id: reviewer.id, role: 'SUPER_ADMIN' },
  });

  assert.equal(approveRes.statusCode, 200);

  const promotedUser = await prisma.user.findUnique({
    where: { id: createRes.body.user.id },
    include: { partnerProfile: true },
  });

  assert.equal(promotedUser?.role, 'PARTNER');
  assert.equal((promotedUser as any).partnerProfile?.accountStatus, 'ACTIVE');
  assert.equal((promotedUser as any).partnerProfile?.onboardingStatus, 'APPROVED');
  assert.equal((promotedUser as any).partnerProfile?.kycStatus, 'APPROVED');

  const loginRes = await runController(login, {
    body: {
      email,
      password,
    },
  });

  assert.equal(loginRes.statusCode, 200);
  assert.equal(loginRes.body.user.role, 'PARTNER');
  assert.equal(loginRes.body.user.accountStatus, 'ACTIVE');
  assert.equal(loginRes.body.user.onboardingStatus, 'APPROVED');
  assert.equal(loginRes.body.user.kycStatus, 'APPROVED');
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
  } finally {
    await cleanupByEmailPrefix();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
