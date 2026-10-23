import { createHash, randomBytes } from 'node:crypto';

export const PASSWORD_RESET_TOKEN_TTL_SECONDS = 10 * 60;

type PasswordResetTokenState = {
  consumedAt?: Date | null;
  expiresAt: Date | string;
};

export const hashPasswordResetToken = (rawToken: string) =>
  createHash('sha256').update(rawToken).digest('hex');

export const createPasswordResetToken = (now = new Date()) => {
  const rawToken = randomBytes(32).toString('hex');

  return {
    rawToken,
    tokenHash: hashPasswordResetToken(rawToken),
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_SECONDS * 1000),
  };
};

export const isPasswordResetTokenActive = (
  token: PasswordResetTokenState,
  now = new Date(),
) => !token.consumedAt && new Date(token.expiresAt).getTime() > now.getTime();
