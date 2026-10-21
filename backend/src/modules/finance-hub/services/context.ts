import type { Request } from 'express';
import { auditContextFromRequest } from './audit.service';

export type ActorContext = {
  actorUserId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export const actorFromRequest = (req: Request): ActorContext => auditContextFromRequest(req);

export const requestBody = (req: Request) =>
  (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}) as Record<string, unknown>;

/**
 * Awaits queries one after another. Inside an interactive transaction all queries share one
 * connection, so they must not run concurrently (Prisma queries only start when awaited).
 */
export const sequential = async <T extends readonly unknown[]>(queries: T): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> => {
  const results: unknown[] = [];
  for (const query of queries) results.push(await query);
  return results as { -readonly [K in keyof T]: Awaited<T[K]> };
};
