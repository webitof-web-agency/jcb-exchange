import { createHash, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { getAiRuntimeConfig } from '../services/ai/aiSettings.service';
import { aiSecurityAuditService } from '../services/ai/aiSecurityAudit.service';

// In-memory fixed-window limiter for public and login endpoints. Counts reset when the server restarts,
// which is acceptable for a single API server. Each limiter keeps its own buckets, so one route's traffic
// never uses up another route's allowance.

type Bucket = { count: number; resetAt: number };

type RateLimitOptions = {
  windowMs: number;
  max: number;
  message?: string;
  /** Defaults to the client IP (req.ip, which honours the app's `trust proxy` setting). */
  key?: (req: Request) => string;
};

const MAX_BUCKETS = 10_000;

export const clientIp = (req: Request) => req.ip || req.socket?.remoteAddress || 'unknown';

export const createRateLimiter = ({ windowMs, max, message = 'Too many requests. Please try again later.', key = clientIp }: RateLimitOptions) => {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const bucketKey = key(req);
    const current = buckets.get(bucketKey);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    bucket.count += 1;
    buckets.set(bucketKey, bucket);

    if (buckets.size > MAX_BUCKETS) {
      for (const [staleKey, value] of buckets) if (value.resetAt <= now) buckets.delete(staleKey);
    }

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: message });
    }
    return next();
  };
};

type DatabaseRateLimitOptions = Omit<RateLimitOptions, 'key'> & {
  namespace: string;
  key?: (req: Request) => string | Promise<string>;
  store?: DatabaseRateLimitStore;
  onLimit?: (req: Request) => void | Promise<void>;
};

type DatabaseRateLimitBucketInput = {
  bucketKey: string;
  windowStartedAt: Date;
  expiresAt: Date;
};

type DatabaseRateLimitBucket = {
  requestCount: number;
  expiresAt: Date;
};

type DatabaseRateLimitStore = (
  input: DatabaseRateLimitBucketInput,
) => Promise<DatabaseRateLimitBucket | undefined>;

const incrementDatabaseRateLimitBucket: DatabaseRateLimitStore = async ({ bucketKey, windowStartedAt, expiresAt }) => {
  const [bucket] = await prisma.$queryRaw<DatabaseRateLimitBucket[]>(Prisma.sql`
    INSERT INTO "AiRateLimitBucket" ("id", "bucketKey", "windowStartedAt", "expiresAt", "requestCount", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${bucketKey}, ${windowStartedAt}, ${expiresAt}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("bucketKey") DO UPDATE SET
      "windowStartedAt" = CASE WHEN "AiRateLimitBucket"."expiresAt" <= CURRENT_TIMESTAMP THEN EXCLUDED."windowStartedAt" ELSE "AiRateLimitBucket"."windowStartedAt" END,
      "expiresAt" = CASE WHEN "AiRateLimitBucket"."expiresAt" <= CURRENT_TIMESTAMP THEN EXCLUDED."expiresAt" ELSE "AiRateLimitBucket"."expiresAt" END,
      "requestCount" = CASE WHEN "AiRateLimitBucket"."expiresAt" <= CURRENT_TIMESTAMP THEN 1 ELSE "AiRateLimitBucket"."requestCount" + 1 END,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "requestCount", "expiresAt"
  `);
  return bucket;
};

/**
 * Shared limiter for production-critical AI traffic. The counter is an atomic
 * Prisma upsert, so separate API instances and restarts share one window.
 * The database migration must be deployed before enabling this route.
 */
export const createDatabaseRateLimiter = ({ namespace, windowMs, max, message = 'Too many requests. Please try again later.', key = clientIp, store = incrementDatabaseRateLimitBucket, onLimit }: DatabaseRateLimitOptions) => (
  async (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const windowStartMs = Math.floor(now / windowMs) * windowMs;

    try {
      const sourceKey = await key(req);
      const bucketKey = createHash('sha256')
        .update(`${namespace}:${sourceKey}`, 'utf8')
        .digest('hex');
      const windowStartedAt = new Date(windowStartMs);
      const expiresAt = new Date(windowStartMs + windowMs);
      const bucket = await store({ bucketKey, windowStartedAt, expiresAt });
      if (!bucket) throw new Error('The database rate-limit bucket was not returned.');
      if (bucket.requestCount > max) {
        if (onLimit) {
          try {
            await onLimit(req);
          } catch {
            // Rate limiting remains effective even when audit storage is unavailable.
          }
        }
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.expiresAt.getTime() - now) / 1000))));
        return res.status(429).json({ error: message });
      }
      return next();
    } catch (error) {
      console.error('[rate-limit] database limiter unavailable:', error instanceof Error ? error.message : error);
      return res.status(503).json({ error: 'Request protection is temporarily unavailable. Please try again shortly.', code: 'RATE_LIMIT_UNAVAILABLE' });
    }
  }
);

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export const surepassRateLimitKey = (req: Request): string => {
  const userId = (req as Request & { user?: { id?: string } }).user?.id || clientIp(req);
  const operation = `${req.baseUrl || ''}${req.path || req.originalUrl || 'unknown'}`.split('?')[0] || 'unknown';
  return `${userId}:${operation}`;
};

/** Shared, database-backed guard for paid Surepass operations across all instances. */
export const surepassVerificationRateLimit = createDatabaseRateLimiter({
  namespace: 'surepass-verification',
  windowMs: DAY,
  max: 30,
  message: 'Surepass verification limit reached for this operation today. Please try again later.',
  key: surepassRateLimitKey,
  onLimit: async (req) => {
    const user = (req as Request & { user?: { id?: string; role?: string } }).user;
    if (!user?.id) return;
    await aiSecurityAuditService.record({
      actorUserId: user.id,
      action: 'SUREPASS_RATE_LIMITED',
      ...(user.role ? { role: user.role } : {}),
      route: req.path,
      reason: 'Shared database rate limit reached',
    });
  },
});

export const loginRateLimit = createRateLimiter({ windowMs: 15 * MINUTE, max: 30, message: 'Too many login attempts from this network. Please try again in a few minutes.' });
export const registerRateLimit = createRateLimiter({ windowMs: 60 * MINUTE, max: 10, message: 'Too many sign-ups from this network. Please try again later.' });
export const otpRateLimit = createRateLimiter({ windowMs: 15 * MINUTE, max: 20, message: 'Too many OTP requests from this network. Please try again in a few minutes.' });
export const passwordResetRateLimit = createRateLimiter({ windowMs: 15 * MINUTE, max: 10, message: 'Too many password reset attempts. Please try again in a few minutes.' });
export const publicLeadRateLimit = createRateLimiter({ windowMs: 10 * MINUTE, max: 10, message: 'Too many enquiries. Please try again in a few minutes.' });
export const jobApplicationRateLimit = createRateLimiter({ windowMs: 60 * MINUTE, max: 5, message: 'Too many applications from this network. Please try again later.' });
export const analyticsEventRateLimit = createRateLimiter({ windowMs: MINUTE, max: 120 });
export const aiChatRateLimit = createDatabaseRateLimiter({
  namespace: 'ai-chat',
  windowMs: 60 * MINUTE,
  max: 50,
  message: 'AI request limit reached. Please try again later.',
  // The provider is part of the bucket identity without ever including the
  // provider API key. This keeps budgets fair when OpenAI and Anthropic are
  // rotated or used by the same operator.
  key: async (req) => {
    const userId = (req as Request & { user?: { id?: string } }).user?.id || clientIp(req);
    const config = await getAiRuntimeConfig();
    return `${userId}:${config.provider}`;
  },
});
export const aiDocumentAssistRateLimit = createRateLimiter({
  windowMs: 10 * MINUTE,
  max: 20,
  message: 'Document AI analysis limit reached. Please try again shortly.',
  key: (req) => (req as Request & { user?: { id?: string } }).user?.id || clientIp(req),
});
export const publicAiRateLimit = createDatabaseRateLimiter({
  namespace: 'public-ai',
  windowMs: 5 * MINUTE,
  max: 12,
  message: 'The assistant request limit was reached. Please try again shortly.',
  key: clientIp,
});
export const listingAiAssistRateLimit = createRateLimiter({
  windowMs: 10 * MINUTE,
  max: 30,
  message: 'Listing assistant limit reached. Please try again shortly.',
  key: (req) => (req as Request & { user?: { id?: string } }).user?.id || clientIp(req),
});
export const listingViewRateLimit = createRateLimiter({ windowMs: 10 * MINUTE, max: 60 });
// The listing forms call this as the seller types, so it is counted per account rather than per network.
export const vehicleIdentityCheckRateLimit = createRateLimiter({
  windowMs: 10 * MINUTE,
  max: 150,
  message: 'Too many vehicle number checks. Please wait a few minutes.',
  key: (req) => (req as Request & { user?: { id?: string } }).user?.id || clientIp(req),
});
export const translationRegisterRateLimit =createRateLimiter({ windowMs: 10 * MINUTE, max: 30 });
// Partner KYC PAN / GSTIN / Aadhaar checks are paid API calls. One shared counter per account covers
// all of them: a normal onboarding needs about 4, so 15 a day leaves room for typos but stops wallet drain.
export const partnerKycVerificationRateLimit = createRateLimiter({
  windowMs: 24 * 60 * MINUTE,
  max: 15,
  message: 'Too many KYC verification attempts today. Please try again tomorrow or contact support.',
  key: (req) => (req as Request & { user?: { id?: string } }).user?.id || clientIp(req),
});
// The vehicle number check on the listing form is a paid RC lookup. Sellers and dealers get 40 a day;
// staff, who list stock in bulk, are not limited.
const sellerRcLookupLimiter = createRateLimiter({
  windowMs: 24 * 60 * MINUTE,
  max: 40,
  message: 'Too many vehicle number checks today. Please try again tomorrow or contact support.',
  key: (req) => (req as Request & { user?: { id?: string } }).user?.id || clientIp(req),
});
export const listingRcLookupRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const role = (req as Request & { user?: { role?: string } }).user?.role;
  if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'EMPLOYEE') return next();
  return sellerRcLookupLimiter(req, res, next);
};
// Chassis-to-RC is also a paid lookup open to sellers on the listing form: same daily cap per account,
// staff not limited.
const sellerChassisLookupLimiter = createRateLimiter({
  windowMs: 24 * 60 * MINUTE,
  max: 20,
  message: 'Too many chassis number checks today. Please try again tomorrow or contact support.',
  key: (req) => (req as Request & { user?: { id?: string } }).user?.id || clientIp(req),
});
export const chassisLookupRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const role = (req as Request & { user?: { role?: string } }).user?.role;
  if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'EMPLOYEE') return next();
  return sellerChassisLookupLimiter(req, res, next);
};
