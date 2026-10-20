import { NextFunction, Request, Response, Router } from 'express';
import { buildVehicleSaleInvoicePdf, findSellAccountIdByInvoiceToken } from '../services/vehicleSaleInvoice.service';

const router = Router();

const WINDOW_MS = 10 * 60 * 1000;
// Without `trust proxy`, every visitor behind the reverse proxy shares one IP, so the
// per-IP ceiling is generous; the per-link limit stops one invoice being hammered.
const MAX_PER_LINK = 20;
const MAX_PER_IP = 300;
const buckets = new Map<string, { count: number; resetAt: number }>();

const hit = (key: string, now: number) => {
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;
  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket;
};

// Tokens are 256-bit random values, so this limiter only guards PDF rendering cost.
const publicInvoiceRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const now = Date.now();
  const ip = req.ip || 'unknown';
  const perIp = hit(`ip:${ip}`, now);
  const perLink = hit(`link:${ip}:${String(req.params.token || '').slice(0, 64)}`, now);
  if (buckets.size > 10_000) {
    for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
  }
  const limited = perIp.count > MAX_PER_IP ? perIp : perLink.count > MAX_PER_LINK ? perLink : null;
  if (limited) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((limited.resetAt - now) / 1000))));
    return res.status(429).send('Too many requests. Please try again later.');
  }
  return next();
};

router.get('/sale-invoices/:token', publicInvoiceRateLimit, async (req: Request, res: Response) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const sellAccountId = await findSellAccountIdByInvoiceToken(req.params.token);
    if (!sellAccountId) return res.status(404).type('text/plain').send('This invoice link is invalid or has expired.');
    const invoice = await buildVehicleSaleInvoicePdf(sellAccountId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.fileName}"`);
    return res.send(invoice.buffer);
  } catch {
    return res.status(404).type('text/plain').send('This invoice link is invalid or has expired.');
  }
});

export default router;
