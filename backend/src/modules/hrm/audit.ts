import type { Request } from 'express';
import type { AuditEntityType } from '@prisma/client';
import prisma from '../../lib/prisma';
import { redactHrmAuditPayload } from './security';

type AuditWriter = { auditLog: { create: (args: any) => Promise<unknown> } };

export const writeHrmAudit = async (input: {
  actorUserId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
}, client: AuditWriter = prisma): Promise<void> => {
  await client.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      ...(input.before !== undefined ? { beforeJson: redactHrmAuditPayload(input.before) as any } : {}),
      ...(input.after !== undefined ? { afterJson: redactHrmAuditPayload(input.after) as any } : {}),
      ...(input.ipAddress ? { ipAddress: input.ipAddress.slice(0, 128) } : {}),
    },
  });
};

export const requestIp = (req: Request): string | null => {
  const value = req.ip?.trim();
  return value ? value.slice(0, 128) : null;
};
