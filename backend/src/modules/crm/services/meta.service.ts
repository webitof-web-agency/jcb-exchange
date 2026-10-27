import prisma from '../../../lib/prisma';
import { dispatchApprovedWhatsAppTemplate, getWhatsAppMetaTemplates } from '../../../services/whatsappIntegration.service';
import { canTouchLead, type CrmAccess } from '../access';
import { badRequest, forbidden, notFound } from '../http';
import { CRM_ANY_PERMISSIONS } from '../permissions';
import { FOLLOW_UP_OUTCOMES, FOLLOW_UP_TYPES, LEAD_TYPES, LIFECYCLES, PRIORITIES, TEMPERATURES } from '../rules';
import { logLeadActivity, textOrNull } from './common';
import { listPipelineStages } from './pipelineStages.service';
import { getCrmConfig, publicCrmConfig, readAutomationState } from './settings.service';

/** Staff who can own CRM work: super admins/admins and employees with a CRM (or enquiries) permission. */
export const listCrmStaff = async () => {
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE', role: { in: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'] } },
    select: { id: true, name: true, mobile: true, role: true, customRole: { select: { permissions: true, name: true } }, adminPermissions: { select: { permission: true } } },
    orderBy: { name: 'asc' },
  });
  return users
    .map((user) => {
      const permissions = Array.isArray(user.customRole?.permissions) ? user.customRole.permissions : user.adminPermissions.map((p) => p.permission);
      const hasCrm = user.role !== 'EMPLOYEE' || permissions.includes('ALL_ACCESS') || CRM_ANY_PERMISSIONS.some((key) => permissions.includes(key));
      return { id: user.id, name: user.name || user.mobile || 'Unnamed', role: user.role, roleName: user.customRole?.name ?? null, hasCrm };
    })
    .filter((user) => user.hasCrm);
};

export const getMeta = async (access: CrmAccess) => {
  const config = await getCrmConfig();
  const pipelineStages = await listPipelineStages();
  return {
    access: {
      isPartner: access.isPartner,
      canRead: access.canRead,
      canManage: access.canManage,
      canPipelineManage: access.canPipelineManage,
      canSeeAll: access.canSeeAll,
      canAssign: access.canAssign,
      canReports: access.canReports,
      canExport: access.canExport,
      canImport: access.canImport,
      canCampaigns: access.canCampaigns,
      canSettings: access.canSettings,
    },
    me: access.userId,
    config: access.isPartner ? { sources: config.sources, lostReasons: config.lostReasons, tags: config.tags, requireNextFollowUp: config.requireNextFollowUp } : publicCrmConfig(config),
    staff: access.isPartner ? [] : await listCrmStaff(),
    enums: { statuses: pipelineStages.map((stage) => stage.code), leadTypes: LEAD_TYPES, priorities: PRIORITIES, temperatures: TEMPERATURES, followUpTypes: FOLLOW_UP_TYPES, outcomes: FOLLOW_UP_OUTCOMES, lifecycles: LIFECYCLES },
    pipelineStages,
    automation: access.canSettings ? await readAutomationState() : null,
  };
};

const templateNeedsVariables = (components: unknown) => /\{\{\s*\d+\s*\}\}/.test(JSON.stringify(components ?? ''));

/** Approved templates the CRM can send one-off (no body variables, since nothing fills them). */
export const listSendableTemplates = async (access: CrmAccess) => {
  if (access.isPartner) return [];
  const templates = await getWhatsAppMetaTemplates();
  return templates
    .filter((t) => t.status === 'APPROVED' && t.metaTemplateId)
    .map((t) => ({ id: t.id, name: t.name, language: t.language, category: t.category, needsVariables: templateNeedsVariables(t.components) }));
};

export const sendLeadWhatsApp = async (access: CrmAccess, leadId: string, body: Record<string, unknown>) => {
  if (access.isPartner || !access.canManage) throw forbidden();
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, dealerId: true, ownerId: true, customer: { select: { name: true, mobile: true, whatsappNumber: true, crmProfile: { select: { doNotContact: true } } } } },
  });
  if (!lead || !canTouchLead(access, lead)) throw notFound('Lead not found.');
  if (lead.customer.crmProfile?.doNotContact) throw badRequest('This contact is marked "do not contact".');
  const templateId = textOrNull(body.templateId, 60);
  if (!templateId) throw badRequest('Choose a template.');
  const template = (await listSendableTemplates(access)).find((t) => t.id === templateId);
  if (!template) throw badRequest('Choose an approved template.');
  if (template.needsVariables) throw badRequest('This template has variables; send it from an automation rule instead.');
  const phone = lead.customer.whatsappNumber || lead.customer.mobile;
  if (!phone) throw badRequest('The customer has no phone number.');
  let result: { sent?: boolean; duplicate?: boolean; error?: string } | undefined;
  try {
    result = await dispatchApprovedWhatsAppTemplate({
      eventCode: 'CRM_MANUAL_MESSAGE',
      relatedEntityType: 'CRM_LEAD',
      // One log row per send: the id carries a timestamp so repeats are allowed.
      relatedEntityId: `${lead.id}:${Date.now()}`,
      templateId,
      recipientType: 'CUSTOMER',
      recipientPhone: phone,
      payloadSnapshot: { leadId: lead.id, sentBy: access.userId },
    }) as typeof result;
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'WhatsApp message could not be sent.');
  }
  await prisma.$transaction((tx) => logLeadActivity(tx, {
    leadId: lead.id,
    actorId: access.userId,
    type: 'WHATSAPP',
    title: `WhatsApp template "${template.name}" sent`,
    content: result?.error ? `Delivery error: ${result.error}` : null,
    metadata: { templateId, sent: Boolean(result?.sent) },
    contacted: Boolean(result?.sent),
  }));
  return { sent: Boolean(result?.sent), error: result?.error ?? null };
};
