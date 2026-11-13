import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { buildAiSecurityAuditPayload } from './aiFieldSecurity.service';

export type AiSecurityAuditEvent = {
  actorUserId: string;
  action: string;
  role?: string;
  toolName?: string;
  maskedFields?: readonly string[];
  route?: string;
  reason?: string;
};

export type AiSecurityAuditWriter = (event: AiSecurityAuditEvent) => Promise<void>;

const safeRoute = (value: string | undefined) => value?.replace(/[\r\n]/gu, '').slice(0, 160);
const safeReason = (value: string | undefined) => value?.replace(/[\r\n]/gu, '').slice(0, 160);

const defaultWriter: AiSecurityAuditWriter = async (event) => {
  const afterJson = buildAiSecurityAuditPayload({
    action: event.action,
    actorUserId: event.actorUserId,
    ...(event.role ? { role: event.role } : {}),
    ...(event.toolName ? { toolName: event.toolName } : {}),
    ...(event.maskedFields ? { maskedFields: event.maskedFields } : {}),
  });
  const safeMetadata = {
    ...afterJson,
    ...(safeRoute(event.route) ? { route: safeRoute(event.route) } : {}),
    ...(safeReason(event.reason) ? { reason: safeReason(event.reason) } : {}),
  } as Prisma.InputJsonObject;

  await prisma.auditLog.create({
    data: {
      actorUserId: event.actorUserId,
      entityType: 'USER',
      entityId: event.actorUserId,
      action: event.action.slice(0, 100),
      afterJson: safeMetadata,
    },
  });
};

export class AiSecurityAuditService {
  constructor(private readonly writer: AiSecurityAuditWriter = defaultWriter) {}

  async record(event: AiSecurityAuditEvent): Promise<void> {
    if (!event.actorUserId.trim()) throw new Error('AI security audit actor is required.');
    if (!event.action.trim()) throw new Error('AI security audit action is required.');
    const normalizedEvent: AiSecurityAuditEvent = {
      actorUserId: event.actorUserId.trim(),
      action: event.action.trim().slice(0, 100),
      ...(event.role ? { role: event.role } : {}),
      ...(event.toolName ? { toolName: event.toolName.trim().slice(0, 100) } : {}),
      ...(event.maskedFields ? { maskedFields: event.maskedFields } : {}),
      ...(event.route ? { route: safeRoute(event.route) || '' } : {}),
      ...(event.reason ? { reason: safeReason(event.reason) || '' } : {}),
    };
    await this.writer(normalizedEvent);
  }
}

export const aiSecurityAuditService = new AiSecurityAuditService();
