import { createHash } from 'crypto';

export type PartnerSignupRolloutConfig = {
  enabled: boolean;
  percentage: number;
  salt: string;
};

const parsePercentage = (value: string | undefined): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

export const getPartnerSignupRolloutConfig = (
  env: NodeJS.ProcessEnv = process.env,
): PartnerSignupRolloutConfig => ({
  enabled: env.PARTNER_SIGNUP_ENABLED?.trim().toLowerCase() !== 'false',
  percentage: parsePercentage(env.PARTNER_SIGNUP_ROLLOUT_PERCENT),
  salt: env.PARTNER_SIGNUP_ROLLOUT_SALT?.trim() || 'jcb-exchange-partner-signup-v1',
});

export const isPartnerSignupGloballyEnabled = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => getPartnerSignupRolloutConfig(env).enabled;

/**
 * Uses a stable, non-sensitive account identity so the same applicant stays in
 * the same rollout bucket across retries and server restarts.
 */
export const isPartnerSignupInRollout = (
  identity: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  const config = getPartnerSignupRolloutConfig(env);
  if (!config.enabled || config.percentage <= 0) return false;
  if (config.percentage >= 100) return true;

  const normalizedIdentity = identity.trim().toLowerCase();
  if (!normalizedIdentity) return false;

  const digest = createHash('sha256')
    .update(`${config.salt}:${normalizedIdentity}`)
    .digest();
  const bucket = digest.readUInt32BE(0) % 100;
  return bucket < config.percentage;
};
