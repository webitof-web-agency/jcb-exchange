import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';

type AuditClient = Pick<typeof prisma, 'finAuditLog'> | Prisma.TransactionClient;

export type FinAuditEntry = {
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const jsonOrNull = (value: unknown) =>
  value === undefined || value === null ? Prisma.DbNull : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

export const auditContextFromRequest = (req: Request) => ({
  actorUserId: req.user?.id ?? null,
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
});

/** Every finance-hub mutation writes one row; pass the transaction client to keep it atomic. */
export const writeFinAudit = (entry: FinAuditEntry, client: AuditClient = prisma) =>
  client.finAuditLog.create({
    data: {
      actorUserId: entry.actorUserId ?? null,
      entityType: entry.entityType.slice(0, 60),
      entityId: entry.entityId.slice(0, 100),
      action: entry.action.slice(0, 40),
      beforeJson: jsonOrNull(entry.before),
      afterJson: jsonOrNull(entry.after),
      reason: entry.reason ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
