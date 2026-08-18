import assert from 'node:assert/strict';
import prisma from '../src/lib/prisma';
import { updateAdminUserStatus } from '../src/controllers/admin.controller';

type MockResponse = {
  statusCode: number;
  body: unknown;
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

async function main() {
  const partner = await prisma.user.findFirst({
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

  assert.ok(partner, 'Expected at least one approved partner for verification.');
  assert.ok(partner.partnerProfile, 'Approved partner must have a partner profile.');

  const originalUserStatus = partner.status;
  const originalAccountStatus = partner.partnerProfile.accountStatus;

  try {
    const inactiveReq = {
      params: { id: partner.id },
      body: { status: 'INACTIVE' },
      user: { id: 'verification-script' },
    } as any;
    const inactiveRes = createMockResponse();

    await updateAdminUserStatus(inactiveReq, inactiveRes as any, (error?: unknown) => {
      if (error) {
        throw error;
      }
    });

    assert.equal(inactiveRes.statusCode, 200, 'Inactive update should succeed.');

    const inactiveUser = (inactiveRes.body as any)?.user;
    assert.equal(inactiveUser.status, 'INACTIVE', 'User status should become INACTIVE.');
    assert.equal(
      inactiveUser.accountStatus,
      'ACTIVE',
      'Approved partner account status should stay ACTIVE while inactive.',
    );

    const activeReq = {
      params: { id: partner.id },
      body: { status: 'ACTIVE' },
      user: { id: 'verification-script' },
    } as any;
    const activeRes = createMockResponse();

    await updateAdminUserStatus(activeReq, activeRes as any, (error?: unknown) => {
      if (error) {
        throw error;
      }
    });

    assert.equal(activeRes.statusCode, 200, 'Active update should succeed.');

    const activeUser = (activeRes.body as any)?.user;
    assert.equal(activeUser.status, 'ACTIVE', 'User status should become ACTIVE again.');
    assert.equal(
      activeUser.accountStatus,
      'ACTIVE',
      'Approved partner account status should remain ACTIVE after reactivation.',
    );
    assert.equal(activeUser.kycStatus, 'APPROVED', 'KYC approval should remain intact.');
    assert.equal(activeUser.onboardingStatus, 'APPROVED', 'Onboarding approval should remain intact.');

    console.log(`Partner reactivation verification passed for ${partner.id}.`);
  } finally {
    await prisma.user.update({
      where: { id: partner.id },
      data: { status: originalUserStatus },
    });

    await prisma.partnerProfile.update({
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
    await prisma.$disconnect();
  });
