import prisma from '../lib/prisma';
import {
  hashPasswordResetToken,
  isPasswordResetTokenActive,
} from '../utils/passwordReset';

const prismaAny = prisma as any;

type PasswordResetTokenRecord = {
  id: string;
  userId: string;
  consumedAt?: Date | null;
  expiresAt: Date | string;
};

export type PasswordResetRepository = {
  findByTokenHash: (tokenHash: string) => Promise<PasswordResetTokenRecord | null>;
  consumeAndUpdatePassword: (input: {
    tokenId: string;
    tokenHash: string;
    passwordHash: string;
  }) => Promise<{ userId: string } | null>;
};

export class PasswordResetServiceError extends Error {
  code: 'TOKEN_INVALID' | 'TOKEN_ALREADY_USED';

  constructor(code: 'TOKEN_INVALID' | 'TOKEN_ALREADY_USED', message: string) {
    super(message);
    this.name = 'PasswordResetServiceError';
    this.code = code;
  }
}

const prismaPasswordResetRepository: PasswordResetRepository = {
  findByTokenHash: async (tokenHash) =>
    prismaAny.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        consumedAt: true,
        expiresAt: true,
      },
    }),
  consumeAndUpdatePassword: async ({ tokenId, tokenHash, passwordHash }) =>
    prisma.$transaction(async (tx) => {
      const consumedAt = new Date();
      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: tokenId,
          tokenHash,
          consumedAt: null,
          expiresAt: { gt: consumedAt },
        },
        data: { consumedAt },
      });

      if (consumed.count !== 1) {
        return null;
      }

      const resetToken = await tx.passwordResetToken.findUnique({
        where: { id: tokenId },
        select: { userId: true },
      });

      if (!resetToken) {
        return null;
      }

      await tx.user.update({
        where: { id: resetToken.userId },
        data: {
          password: passwordHash,
          authVersion: { increment: 1 },
        },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          id: { not: tokenId },
          consumedAt: null,
        },
        data: { consumedAt },
      });

      return { userId: resetToken.userId };
    }),
};

export const createPasswordResetTokenRecord = async (input: {
  userId: string;
  challengeId: string;
  tokenHash: string;
  expiresAt: Date;
}) => prismaAny.passwordResetToken.create({ data: input });

export const completePasswordReset = async ({
  rawToken,
  passwordHash,
  repository = prismaPasswordResetRepository,
}: {
  rawToken: string;
  passwordHash: string;
  repository?: PasswordResetRepository;
}) => {
  const tokenHash = hashPasswordResetToken(rawToken);
  const token = await repository.findByTokenHash(tokenHash);

  if (!token || !isPasswordResetTokenActive(token)) {
    throw new PasswordResetServiceError(
      'TOKEN_INVALID',
      'This password reset session is invalid or expired. Please request a new OTP.',
    );
  }

  const result = await repository.consumeAndUpdatePassword({
    tokenId: token.id,
    tokenHash,
    passwordHash,
  });

  if (!result) {
    throw new PasswordResetServiceError(
      'TOKEN_ALREADY_USED',
      'This password reset session is no longer available. Please request a new OTP.',
    );
  }

  return result;
};
