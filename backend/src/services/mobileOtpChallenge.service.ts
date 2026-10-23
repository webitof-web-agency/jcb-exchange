import prisma from '../lib/prisma';
import {
  MOBILE_OTP_COOLDOWN_SECONDS,
  getLoginMobileCandidates,
  MOBILE_OTP_MAX_RESENDS,
  MOBILE_OTP_MAX_VERIFY_ATTEMPTS,
  MOBILE_OTP_RESEND_WINDOW_SECONDS,
  MOBILE_OTP_PURPOSE_LOGIN,
  type MobileOtpPurpose,
} from '../utils/mobileOtp';

const prismaAny = prisma as any;

export const getLatestMobileOtpChallenge = async (
  mobile: string,
  purpose: MobileOtpPurpose = MOBILE_OTP_PURPOSE_LOGIN,
) =>
  prismaAny.mobileOtpChallenge.findFirst({
    where: {
      mobile: { in: getLoginMobileCandidates(mobile) },
      purpose,
    },
    orderBy: { createdAt: 'desc' },
  });

export const getMobileOtpChallenge = async (id: string, purpose?: MobileOtpPurpose) =>
  prismaAny.mobileOtpChallenge.findFirst({
    where: {
      id,
      ...(purpose ? { purpose } : {}),
    },
  });

export const getMobileOtpCooldownSeconds = async (
  mobile: string,
  purpose: MobileOtpPurpose = MOBILE_OTP_PURPOSE_LOGIN,
) => {
  const challenge = await getLatestMobileOtpChallenge(mobile, purpose);
  if (!challenge) {
    return 0;
  }

  const cooldownEndsAt = new Date(challenge.lastSentAt).getTime() + MOBILE_OTP_COOLDOWN_SECONDS * 1000;
  const secondsRemaining = Math.ceil((cooldownEndsAt - Date.now()) / 1000);
  return secondsRemaining > 0 ? secondsRemaining : 0;
};

export const createMobileOtpChallenge = async ({
  mobile,
  userId,
  expiresInSeconds,
  purpose = MOBILE_OTP_PURPOSE_LOGIN,
}: {
  mobile: string;
  userId?: string | null;
  expiresInSeconds: number;
  purpose?: MobileOtpPurpose;
}) => {
  const now = new Date();

  await prismaAny.mobileOtpChallenge.updateMany({
    where: { mobile, purpose, status: 'PENDING' },
    data: { status: 'EXPIRED' },
  });

  return prismaAny.mobileOtpChallenge.create({
    data: {
      mobile,
      ...(userId ? { userId } : {}),
      purpose,
      createdAt: now,
      lastSentAt: now,
      expiresAt: new Date(now.getTime() + expiresInSeconds * 1000),
    },
  });
};

export const markMobileOtpChallengeVerified = async (id: string, userId?: string | null) =>
  prismaAny.mobileOtpChallenge.update({
    where: { id },
    data: {
      status: 'VERIFIED',
      verifiedAt: new Date(),
      ...(userId ? { userId } : {}),
    },
  });

export const recordMobileOtpAttempt = async (id: string) =>
  prismaAny.mobileOtpChallenge.update({
    where: { id },
    data: { attemptCount: { increment: 1 } },
  });

export const updateMobileOtpChallengeAfterResend = async (id: string, expiresInSeconds: number) =>
  prismaAny.mobileOtpChallenge.update({
    where: { id },
    data: {
      lastSentAt: new Date(),
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      resendCount: { increment: 1 },
    },
  });

export const expireMobileOtpChallenge = async (id: string) =>
  prismaAny.mobileOtpChallenge.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'EXPIRED' },
  });

export const canVerifyMobileOtpChallenge = (challenge: {
  status: string;
  attemptCount: number;
  expiresAt: Date | string;
}) =>
  challenge.status === 'PENDING' &&
  new Date(challenge.expiresAt).getTime() > Date.now() &&
  challenge.attemptCount < MOBILE_OTP_MAX_VERIFY_ATTEMPTS;

export const canResendMobileOtpChallenge = (challenge: {
  status: string;
  resendCount: number;
  createdAt: Date | string;
}) =>
  challenge.status === 'PENDING' &&
  new Date(challenge.createdAt).getTime() + MOBILE_OTP_RESEND_WINDOW_SECONDS * 1000 > Date.now() &&
  challenge.resendCount < MOBILE_OTP_MAX_RESENDS;

export const getMobileOtpResendAction = (
  challenge: {
    status: string;
    resendCount: number;
    createdAt: Date | string;
  } | null | undefined,
) => (challenge && canResendMobileOtpChallenge(challenge) ? 'RESEND' : 'SEND') as 'RESEND' | 'SEND';
