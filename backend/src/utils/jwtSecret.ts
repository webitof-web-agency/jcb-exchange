const DEVELOPMENT_JWT_SECRET = 'jcbexchange_super_secret_key_123';

/**
 * The development fallback is public in source control, so tokens signed with it
 * can be forged by anyone. Refuse to run production auth without a real secret.
 */
export const resolveJwtSecret = (env: NodeJS.ProcessEnv = process.env) => {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production.');
  }
  return DEVELOPMENT_JWT_SECRET;
};
