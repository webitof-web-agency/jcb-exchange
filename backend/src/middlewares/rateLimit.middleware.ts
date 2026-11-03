import type { NextFunction, Request, Response } from 'express';

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

const MINUTE = 60 * 1000;

export const loginRateLimit = createRateLimiter({ windowMs: 15 * MINUTE, max: 30, message: 'Too many login attempts from this network. Please try again in a few minutes.' });
export const registerRateLimit = createRateLimiter({ windowMs: 60 * MINUTE, max: 10, message: 'Too many sign-ups from this network. Please try again later.' });
export const otpRateLimit = createRateLimiter({ windowMs: 15 * MINUTE, max: 20, message: 'Too many OTP requests from this network. Please try again in a few minutes.' });
export const passwordResetRateLimit = createRateLimiter({ windowMs: 15 * MINUTE, max: 10, message: 'Too many password reset attempts. Please try again in a few minutes.' });
export const publicLeadRateLimit = createRateLimiter({ windowMs: 10 * MINUTE, max: 10, message: 'Too many enquiries. Please try again in a few minutes.' });
export const jobApplicationRateLimit = createRateLimiter({ windowMs: 60 * MINUTE, max: 5, message: 'Too many applications from this network. Please try again later.' });
export const analyticsEventRateLimit = createRateLimiter({ windowMs: MINUTE, max: 120 });
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
