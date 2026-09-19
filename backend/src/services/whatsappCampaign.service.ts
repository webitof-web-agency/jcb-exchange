import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  canConfirmWhatsAppCampaign,
  getWhatsAppReminderDefinition,
  getWhatsAppReminderWindow,
  getWhatsAppReminderWindowUnit,
  isWhatsAppTemplatePurposeAllowed,
  normalizeWhatsAppRecipientPhone,
  type WhatsAppReminderKind,
} from '../modules/whatsapp-core';
import { dispatchApprovedWhatsAppTemplate, isWhatsAppIntegrationEnabled } from './whatsappIntegration.service';
import { getOptedInWhatsAppRecipients, type WhatsAppAudienceRecipient } from './whatsappAudience.service';

const CAMPAIGN_LIMIT = 200;
type CampaignCategory = 'MARKETING' | 'JOB_ALERTS';
type CampaignRecipientInput = WhatsAppAudienceRecipient;

const normalizePhone = (phone?: string | null) => normalizeWhatsAppRecipientPhone(phone) || null;

export const saveWhatsAppConsent = async ({ phone, category, optedIn, actorUserId }: { phone: string; category: CampaignCategory; optedIn: boolean; actorUserId: string }) => {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) throw new Error('Enter a valid WhatsApp number with country code.');
  return prisma.whatsAppConsent.upsert({
    where: { phone_category: { phone: normalizedPhone, category } },
    update: { optedIn, source: 'SUPERADMIN_PORTAL', updatedByUserId: actorUserId },
    create: { phone: normalizedPhone, category, optedIn, source: 'SUPERADMIN_PORTAL', updatedByUserId: actorUserId },
  });
};

const createCampaignFromRecipients = async ({
  name,
  category,
  templateId,
  actorUserId,
  recipients,
  audienceFilters,
}: {
  name: string;
  category: CampaignCategory;
  templateId: string;
  actorUserId: string;
  recipients: CampaignRecipientInput[];
  audienceFilters: Record<string, unknown>;
}) => prisma.whatsAppCampaign.create({
  data: {
    name,
    category,
    templateId,
    createdByUserId: actorUserId,
    audienceFilters: audienceFilters as Prisma.InputJsonValue,
    recipients: { create: recipients.slice(0, CAMPAIGN_LIMIT) },
  },
  include: { _count: { select: { recipients: true } }, template: { select: { name: true, language: true, status: true } } },
});

export const createWhatsAppCampaign = async ({ name, category, templateId, actorUserId }: { name: string; category: CampaignCategory; templateId: string; actorUserId: string }) => {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 120) throw new Error('Campaign name must be between 1 and 120 characters.');
  const template = await prisma.whatsAppMetaTemplate.findUnique({ where: { id: templateId }, select: { id: true, status: true, metaTemplateId: true, category: true } });
  if (!template || template.status !== 'APPROVED' || !template.metaTemplateId) throw new Error('Select an approved Meta template.');
  if (!isWhatsAppTemplatePurposeAllowed(template.category, [category])) throw new Error('Selected template does not belong to this campaign category.');
  const recipients = (await getOptedInWhatsAppRecipients(category)).slice(0, CAMPAIGN_LIMIT);
  return createCampaignFromRecipients({
    name: trimmedName,
    category,
    templateId,
    actorUserId,
    recipients,
    audienceFilters: { optedInOnly: true, cappedAt: CAMPAIGN_LIMIT },
  });
};

export const createWhatsAppReminderCampaign = async ({ kind, templateId, actorUserId, windowValue }: { kind: WhatsAppReminderKind; templateId: string; actorUserId: string; windowValue?: number }) => {
  const reminderWindow = getWhatsAppReminderWindow(kind, windowValue);
  const definition = getWhatsAppReminderDefinition(kind, reminderWindow);
  const template = await prisma.whatsAppMetaTemplate.findUnique({ where: { id: templateId }, select: { id: true, status: true, metaTemplateId: true, category: true } });
  if (!template || template.status !== 'APPROVED' || !template.metaTemplateId) throw new Error('Select an approved Meta template.');
  if (!isWhatsAppTemplatePurposeAllowed(template.category, [definition.category])) {
    throw new Error('Selected template does not belong to this reminder type.');
  }
  const optedInRecipients = await getOptedInWhatsAppRecipients(definition.category);
  let recipients = optedInRecipients;
  if (kind === 'INTERVIEW_48_HOURS') {
    const now = new Date();
    const end = new Date(now.getTime() + reminderWindow * 60 * 60 * 1000);
    const interviews = await prisma.interview.findMany({
      where: { status: { in: ['SCHEDULED', 'RESCHEDULED'] }, scheduledAt: { gte: now, lte: end } },
      select: { candidateId: true },
    });
    const ids = new Set(interviews.map((item) => item.candidateId));
    recipients = optedInRecipients.filter((recipient) => recipient.sourceEntityType === 'CANDIDATE' && recipient.sourceEntityId && ids.has(recipient.sourceEntityId));
  } else {
    const now = new Date();
    const end = new Date(now.getTime() + reminderWindow * 24 * 60 * 60 * 1000);
    const subscriptions = await (prisma as any).customerPrimeSubscription.findMany({
      where: { status: 'ACTIVE', expiresAt: { gte: now, lte: end } },
      select: { userId: true },
    }) as Array<{ userId: string }>;
    const userIds = new Set(subscriptions.map((item) => item.userId));
    recipients = optedInRecipients.filter((recipient) => recipient.sourceEntityType === 'USER' && recipient.sourceEntityId && userIds.has(recipient.sourceEntityId));
  }
  return createCampaignFromRecipients({
    name: definition.title,
    category: definition.category,
    templateId,
    actorUserId,
    recipients,
      audienceFilters: {
        optedInOnly: true,
        reminderKind: kind,
        reminderWindow,
        reminderWindowUnit: getWhatsAppReminderWindowUnit(kind),
        cappedAt: CAMPAIGN_LIMIT,
      },
  });
};

export const listWhatsAppCampaigns = async () => prisma.whatsAppCampaign.findMany({
  orderBy: { createdAt: 'desc' },
  take: 30,
  include: { _count: { select: { recipients: true } }, template: { select: { name: true, language: true } } },
});

export const confirmWhatsAppCampaign = async ({ campaignId, actorUserId }: { campaignId: string; actorUserId: string }) => {
  const campaign = await prisma.whatsAppCampaign.findUnique({ where: { id: campaignId }, include: { recipients: true } });
  if (!campaign) throw new Error('Campaign not found.');
  if (!canConfirmWhatsAppCampaign({ status: campaign.status, recipientCount: campaign.recipients.length })) {
    throw new Error('Only a non-empty draft campaign can be confirmed.');
  }
  if (!await isWhatsAppIntegrationEnabled()) {
    throw new Error('WhatsApp is disabled. Enable the global integration before confirming this campaign.');
  }
  await prisma.whatsAppCampaign.update({ where: { id: campaignId }, data: { status: 'SENDING', confirmedByUserId: actorUserId, confirmedAt: new Date() } });
  for (const recipient of campaign.recipients) {
    const result = await dispatchApprovedWhatsAppTemplate({
      eventCode: 'WHATSAPP_CAMPAIGN',
      relatedEntityType: 'WHATSAPP_CAMPAIGN',
      relatedEntityId: campaign.id,
      templateId: campaign.templateId,
      recipientType: recipient.recipientType,
      recipientPhone: recipient.recipientPhone,
      payloadSnapshot: { campaignId: campaign.id, campaignName: campaign.name, category: campaign.category },
    });
    await prisma.whatsAppCampaignRecipient.update({
      where: { id: recipient.id },
      data: { status: result.sent ? 'SENT' : 'FAILED', ...(result.sent ? { sentAt: new Date() } : { errorMessage: ('error' in result ? result.error : null) || 'Message was not sent.' }) },
    });
  }
  return prisma.whatsAppCampaign.update({ where: { id: campaignId }, data: { status: 'COMPLETED', completedAt: new Date() }, include: { _count: { select: { recipients: true } } } });
};

export const getCampaignRecipientType = (category: CampaignCategory) =>
  category === 'MARKETING' ? 'CUSTOMER' as const : 'CANDIDATE' as const;
