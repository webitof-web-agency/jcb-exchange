import prisma from '../lib/prisma';
import {
  EMAIL_OTP_COOLDOWN_SECONDS,
  EMAIL_OTP_MAX_RESENDS,
  EMAIL_OTP_RESEND_WINDOW_SECONDS,
} from '../utils/emailOtp';

const prismaAny = prisma as any;

export const getLatestEmailOtpChallenge = async (email: string) =>
  prismaAny.emailOtpChallenge.findFirst({
    where: { email },
    orderBy: { createdAt: 'desc' },
  });

export const getEmailOtpChallenge = async (id: string) =>
  prismaAny.emailOtpChallenge.findUnique({ where: { id } });

export const getEmailOtpCooldownSeconds = async (email: string) => {
  const challenge = await getLatestEmailOtpChallenge(email);
  if (!challenge) {
    return 0;
  }

  const cooldownEndsAt = new Date(challenge.lastSentAt).getTime() + EMAIL_OTP_COOLDOWN_SECONDS * 1000;
  const secondsRemaining = Math.ceil((cooldownEndsAt - Date.now()) / 1000);
  return secondsRemaining > 0 ? secondsRemaining : 0;
};

export const createEmailOtpChallenge = async ({
  email,
  userId,
  otpHash,
  expiresInSeconds,
}: {
  email: string;
  userId: string;
  otpHash: string;
  expiresInSeconds: number;
}) => {
  const now = new Date();

  await prismaAny.emailOtpChallenge.updateMany({
    where: { email, status: 'PENDING' },
    data: { status: 'EXPIRED' },
  });

  return prismaAny.emailOtpChallenge.create({
    data: {
      email,
      userId,
      otpHash,
      createdAt: now,
      lastSentAt: now,
      expiresAt: new Date(now.getTime() + expiresInSeconds * 1000),
    },
  });
};

export const markEmailOtpChallengeVerified = async (id: string) =>
  prismaAny.emailOtpChallenge.update({
    where: { id },
    data: { status: 'VERIFIED', verifiedAt: new Date() },
  });

export const recordEmailOtpAttempt = async (id: string) =>
  prismaAny.emailOtpChallenge.update({
    where: { id },
    data: { attemptCount: { increment: 1 } },
  });

export const updateEmailOtpChallengeAfterResend = async (
  id: string,
  otpHash: string,
  expiresInSeconds: number,
) =>
  prismaAny.emailOtpChallenge.update({
    where: { id },
    data: {
      otpHash,
      lastSentAt: new Date(),
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      resendCount: { increment: 1 },
      attemptCount: 0,
    },
  });

export const expireEmailOtpChallenge = async (id: string) =>
  prismaAny.emailOtpChallenge.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'EXPIRED' },
  });

export const canResendEmailOtpChallenge = (challenge: {
  status: string;
  resendCount: number;
  createdAt: Date | string;
}) =>
  challenge.status === 'PENDING' &&
  new Date(challenge.createdAt).getTime() + EMAIL_OTP_RESEND_WINDOW_SECONDS * 1000 > Date.now() &&
  challenge.resendCount < EMAIL_OTP_MAX_RESENDS;
