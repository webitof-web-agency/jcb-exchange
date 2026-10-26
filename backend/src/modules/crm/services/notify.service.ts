import prisma from '../../../lib/prisma';
import { PushNotificationService } from '../../../services/pushNotification.service';
import { dispatchMarketplaceWhatsApp } from '../../../services/whatsappIntegration.service';
import { publishNotification } from '../../../services/notificationRealtime';
import { buildAssignmentNotification, type AssignmentNotificationEntity } from '../assignmentNotifications';

/**
 * CRM notifications. In-app + push go to staff/partners; WhatsApp/SMS use the marketplace
 * automation rules (WhatsApp & SMS settings pages), so nothing is sent until an admin maps an
 * approved template to the event. Template body variables, in order:
 *   CRM_LEAD_ACKNOWLEDGEMENT  {{1}} customer name, {{2}} enquiry
 *   CRM_LEAD_ASSIGNED         {{1}} staff name, {{2}} customer name, {{3}} customer mobile, {{4}} enquiry
 *   CRM_FOLLOW_UP_REMINDER    {{1}} staff name, {{2}} customer name, {{3}} follow-up type, {{4}} due at, {{5}} customer mobile
 *   CRM_APPOINTMENT_REMINDER  {{1}} customer name, {{2}} visit/inspection, {{3}} date & time
 *   CRM_MATCHING_LISTING      {{1}} customer name, {{2}} listing title, {{3}} price, {{4}} link
 *   CRM_REENGAGEMENT          {{1}} customer name, {{2}} enquiry
 */

export type CrmEvent =
  | 'CRM_LEAD_ACKNOWLEDGEMENT'
  | 'CRM_LEAD_ASSIGNED'
  | 'CRM_FOLLOW_UP_REMINDER'
  | 'CRM_APPOINTMENT_REMINDER'
  | 'CRM_MATCHING_LISTING'
  | 'CRM_REENGAGEMENT';

// Portal URL prefix: /admin is the super admin panel; ADMIN and EMPLOYEE use /employee.
const rolePrefix = (role: string) => (role === 'SUPER_ADMIN' ? '/admin' : '/employee');

/** Portal link for a user's role; partners land on their own lead pages. */
export const crmLinkFor = (role: string, target: { leadId?: string | null; tab?: string; path?: string | null }) => {
  if (role === 'PARTNER') return target.leadId ? `/partner/leads/${target.leadId}` : '/partner/leads';
  const base = `${rolePrefix(role)}/crm`;
  if (target.path) return `${rolePrefix(role)}${target.path}`;
  if (target.leadId) return `${base}/leads/${target.leadId}`;
  // One page per CRM menu item (tab keys kept for callers: followups → /follow-ups).
  return target.tab ? `${base}/${target.tab === 'followups' ? 'follow-ups' : target.tab}` : base;
};

export const formatIst = (date: Date) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }).format(date);

type InAppInput = {
  title: string;
  message: string;
  type: string;
  leadId?: string | null;
  tab?: string;
  path?: string | null;
  push?: boolean;
};

/** In-app notification + optional push for each user (role-aware links). Never throws. */
export const notifyUsers = async (userIds: string[], input: InAppInput) => {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    const users = await prisma.user.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { id: true, role: true } });
    for (const user of users) {
      const link = crmLinkFor(user.role, {
        leadId: input.leadId ?? null,
        ...(input.tab ? { tab: input.tab } : {}),
        ...(input.path ? { path: input.path } : {}),
      });
      const notification = await prisma.notification.create({
        data: { userId: user.id, title: input.title.slice(0, 200), message: input.message.slice(0, 1000), type: input.type, link },
      });
      publishNotification(user.id, notification);
      if (input.push !== false) {
        void PushNotificationService.sendToUser(user.id, { title: input.title, body: input.message, url: link });
      }
    }
  } catch (error) {
    console.error('[crm] notification failed:', error);
  }
};

type AssignmentNotificationInput = {
  recipientId: string;
  entity: AssignmentNotificationEntity;
  entityId: string;
  subject: string;
  detail?: string | null;
  actorId?: string | null;
  push?: boolean;
};

const actorNameFor = async (actorId?: string | null) => {
  if (!actorId) return null;
  try {
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
    return actor?.name ?? null;
  } catch {
    return null;
  }
};

/** Sends one consistent assignment notification for every CRM ownership domain. */
export const notifyAssignment = async ({ recipientId, entity, entityId, subject, detail, actorId, push }: AssignmentNotificationInput) => {
  const actorName = await actorNameFor(actorId);
  const notification = buildAssignmentNotification({
    entity,
    entityId,
    subject,
    ...(detail !== undefined ? { detail } : {}),
    actorName,
  });
  await notifyUsers([recipientId], {
    ...notification,
    path: notification.path,
    ...(push !== undefined ? { push } : {}),
  });
};

export const notifyBulkLeadAssignment = async (recipientId: string, count: number, actorId: string | null) => {
  const actorName = (await actorNameFor(actorId))?.trim() || 'CRM automation';
  await notifyUsers([recipientId], {
    title: `${count} leads assigned to you`,
    message: `${actorName} assigned you ${count} leads. Open CRM to review them.`,
    type: 'CRM_LEAD_ASSIGNED',
    path: '/crm/leads',
  });
};

const body = (values: Array<string | null | undefined>) => [{
  type: 'body',
  parameters: values.map((value) => ({ type: 'text', text: (value || '-').toString().slice(0, 200) })),
}];

type MessageInput = {
  event: CrmEvent;
  recipientType: 'CUSTOMER' | 'EMPLOYEE' | 'PARTNER';
  phone: string | null | undefined;
  entityId: string;
  values: Array<string | null | undefined>;
  variables: Record<string, unknown>;
  /** Re-sends of the same event for the same entity need a distinct suffix (e.g. a due time). */
  dedupeSuffix?: string;
};

/** WhatsApp (+ SMS via the same automation rule set). Isolated from CRM transactions. */
export const sendCrmMessage = async (input: MessageInput) => {
  if (!input.phone) return { queued: false, reason: 'RECIPIENT_PHONE_REQUIRED' };
  try {
    return await dispatchMarketplaceWhatsApp({
      eventCode: input.event,
      relatedEntityType: 'CRM',
      relatedEntityId: input.entityId,
      recipientType: input.recipientType,
      recipientPhone: input.phone,
      templateComponents: body(input.values),
      payloadSnapshot: input.variables,
      ...(input.dedupeSuffix ? { dedupeSuffix: input.dedupeSuffix } : {}),
    });
  } catch (error) {
    console.error(`[crm] ${input.event} dispatch failed:`, error);
    return { queued: false, reason: 'DISPATCH_ERROR' };
  }
};

export const leadTypeLabel = (leadType: string) => ({
  BUY: 'machine purchase', SELL: 'selling your machine', FINANCE: 'finance / loan', INSURANCE: 'insurance', RTO: 'RTO / transfer',
  TRANSPORT: 'transport', DEALER_ONBOARDING: 'dealer partnership', PRIME: 'Prime membership', VERIFICATION: 'vehicle verification', OTHER: 'your enquiry',
} as Record<string, string>)[leadType] || 'your enquiry';
