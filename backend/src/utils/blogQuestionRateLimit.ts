import type { NextFunction, Request, Response } from 'express';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_SUBMISSIONS = 5;

type SubmissionBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, SubmissionBucket>();

const getBucketKey = (req: Request) => `${req.user?.id || 'anonymous'}:${req.ip || 'unknown'}`;

export const blogQuestionRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const now = Date.now();
  const key = getBucketKey(req);
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + WINDOW_MS }
    : current;

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > MAX_SUBMISSIONS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({ error: 'Too many questions submitted. Please try again later.' });
  }

  return next();
};
