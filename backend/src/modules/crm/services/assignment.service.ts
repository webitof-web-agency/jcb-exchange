import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, notFound } from '../http';
import { pickAssignee, ruleMatchesLead, type AssignmentConditions } from '../rules';
import { logLeadActivity, stringList, textOrNull, type Db } from './common';
import { leadTypeLabel, notifyAssignment, notifyUsers, sendCrmMessage } from './notify.service';
import { getCrmConfig } from './settings.service';
import { listPipelineStageStatusSets } from './pipelineStages.service';

const STRATEGIES = ['ROUND_ROBIN', 'LEAST_LOAD', 'SPECIFIC_USER'];

const readConditions = (value: unknown): AssignmentConditions => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    leadTypes: stringList(input.leadTypes).map((v) => v.toUpperCase()),
    sources: stringList(input.sources).map((v) => v.toUpperCase()),
    priorities: stringList(input.priorities).map((v) => v.toUpperCase()),
    categoryIds: stringList(input.categoryIds, 50),
    states: stringList(input.states, 50),
    cities: stringList(input.cities, 100),
  };
};

const ruleData = (body: Record<string, unknown>) => {
  const name = textOrNull(body.name, 120);
  if (!name) throw badRequest('Give the rule a name.');
  const strategy = String(body.strategy || 'ROUND_ROBIN').toUpperCase();
  if (!STRATEGIES.includes(strategy)) throw badRequest('Unknown assignment strategy.');
  const assigneeIds = stringList(body.assigneeIds, 50);
  if (!assigneeIds.length) throw badRequest('Choose at least one staff member.');
  return {
    name,
    strategy,
    assigneeIds,
    enabled: body.enabled === undefined ? true : Boolean(body.enabled),
    sortOrder: Math.round(Number(body.sortOrder) || 0),
    conditions: readConditions(body.conditions) as unknown as Prisma.InputJsonValue,
  };
};

export const listRules = () => prisma.crmAssignmentRule.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
export const createRule = (body: Record<string, unknown>) => prisma.crmAssignmentRule.create({ data: ruleData(body) });
export const updateRule = async (id: string, body: Record<string, unknown>) => {
  if (!(await prisma.crmAssignmentRule.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Rule not found.');
  return prisma.crmAssignmentRule.update({ where: { id }, data: ruleData(body) });
};
export const deleteRule = async (id: string) => {
  await prisma.crmAssignmentRule.delete({ where: { id } });
  return { deleted: true };
};

/** Moves pending follow-ups that belonged to the old owner (or nobody) to the new owner. */
export const moveFollowUps = (db: Db, leadId: string, fromOwnerId: string | null, toOwnerId: string | null) =>
  db.crmFollowUp.updateMany({
    where: { leadId, status: 'PENDING', OR: [{ ownerId: null }, ...(fromOwnerId ? [{ ownerId: fromOwnerId }] : [])] },
    data: { ownerId: toOwnerId },
  });

/** Tells the new owner (in-app/push; WhatsApp/SMS if the CRM_LEAD_ASSIGNED rule is set up). */
export const announceAssignment = async (leadId: string, ownerId: string, reason: string, actorId: string | null = null) => {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      leadType: true,
      listingTitleSnapshot: true,
      customer: { select: { name: true, mobile: true } },
      owner: { select: { name: true, mobile: true, role: true } },
      followUps: { where: { status: 'PENDING' }, select: { id: true } },
    },
  });
  if (!lead) return;
  const what = lead.listingTitleSnapshot || leadTypeLabel(lead.leadType);
  await notifyAssignment({
    recipientId: ownerId,
    entity: 'LEAD',
    entityId: leadId,
    subject: lead.customer.name || 'A customer',
    detail: [what, reason, lead.followUps.length ? `${lead.followUps.length} pending follow-up${lead.followUps.length === 1 ? '' : 's'} moved to you` : null].filter(Boolean).join(' - '),
    actorId,
  });
  const config = await getCrmConfig();
  if (config.reminders.whatsappToOwner || config.reminders.smsToOwner) {
    await sendCrmMessage({
      event: 'CRM_LEAD_ASSIGNED',
      recipientType: lead.owner?.role === 'PARTNER' ? 'PARTNER' : 'EMPLOYEE',
      phone: lead.owner?.mobile,
      entityId: lead.id,
      values: [lead.owner?.name, lead.customer.name, lead.customer.mobile, what],
      variables: { staffName: lead.owner?.name, customerName: lead.customer.name, customerMobile: lead.customer.mobile, enquiry: what },
      dedupeSuffix: ownerId,
    });
  }
};

/** Applies the first matching enabled rule to an unowned, platform-routed lead. Returns the new owner. */
export const autoAssignLead = async (leadId: string): Promise<string | null> => {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true, ownerId: true, leadType: true, source: true, priority: true, categoryId: true,
      requirementState: true, requirementCity: true, listingLocationStateSnapshot: true, listingLocationCitySnapshot: true,
      dealer: { select: { role: true } }, customer: { select: { state: true, city: true } },
      listing: { select: { categoryId: true } },
    },
  });
  if (!lead || lead.ownerId || lead.dealer.role === 'PARTNER') return null;
  const rules = await prisma.crmAssignmentRule.findMany({ where: { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  const assignable = {
    leadType: lead.leadType,
    source: lead.source,
    priority: lead.priority,
    categoryId: lead.categoryId ?? lead.listing?.categoryId ?? null,
    state: lead.requirementState ?? lead.customer.state ?? lead.listingLocationStateSnapshot ?? null,
    city: lead.requirementCity ?? lead.customer.city ?? lead.listingLocationCitySnapshot ?? null,
  };
  for (const rule of rules) {
    if (!ruleMatchesLead(rule.conditions as AssignmentConditions | null, assignable)) continue;
    const staff = await prisma.user.findMany({
      where: { id: { in: rule.assigneeIds }, status: 'ACTIVE', role: { in: ['EMPLOYEE', 'SUPER_ADMIN', 'ADMIN'] } },
      select: { id: true },
    });
    const { terminal } = await listPipelineStageStatusSets();
    const loads = await prisma.lead.groupBy({
      by: ['ownerId'],
      where: { ownerId: { in: staff.map((s) => s.id) }, status: { notIn: [...terminal] }, mergedIntoId: null },
      _count: { _all: true },
    });
    const pick = pickAssignee(rule, new Set(staff.map((s) => s.id)), new Map(loads.map((row) => [row.ownerId as string, row._count._all])));
    if (!pick) continue;
    await prisma.$transaction(async (tx) => {
      await tx.crmAssignmentRule.update({ where: { id: rule.id }, data: { cursor: pick.nextCursor } });
      await tx.lead.update({ where: { id: lead.id }, data: { ownerId: pick.userId, assignedAt: new Date() } });
      await moveFollowUps(tx, lead.id, null, pick.userId);
      await logLeadActivity(tx, { leadId: lead.id, actorId: null, type: 'ASSIGNED', title: 'Auto-assigned', content: `Assigned by rule "${rule.name}".`, metadata: { ruleId: rule.id, ownerId: pick.userId } });
    });
    await announceAssignment(lead.id, pick.userId, `Auto-assigned by rule "${rule.name}".`);
    return pick.userId;
  }
  return null;
};
