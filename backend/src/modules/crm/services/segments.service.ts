import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { createWhatsAppCampaignForUsers } from '../../../services/whatsappCampaign.service';
import type { CrmAccess } from '../access';
import { badRequest, forbidden, notFound } from '../http';
import { LEAD_TYPES, LIFECYCLES, TEMPERATURES } from '../rules';
import { contactSelect, stringList, textOrNull } from './common';
import { listPipelineStageStatusSets } from './pipelineStages.service';

export type SegmentFilters = {
  lifecycles: string[];
  contactTypes: string[];
  tags: string[];
  states: string[];
  cities: string[];
  leadStatuses: string[];
  leadTypes: string[];
  temperatures: string[];
  sources: string[];
  primeOnly: boolean;
  openLeadOnly: boolean;
  inactiveDays: number | null;
};

const pick = (value: unknown, allowed?: readonly string[]) => {
  const list = stringList(value, 50);
  return allowed ? list.map((v) => v.toUpperCase()).filter((v) => allowed.includes(v)) : list;
};

export const readSegmentFilters = (value: unknown): SegmentFilters => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const inactive = Number(input.inactiveDays);
  return {
    lifecycles: pick(input.lifecycles, LIFECYCLES),
    contactTypes: pick(input.contactTypes).map((v) => v.toUpperCase()),
    tags: pick(input.tags),
    states: pick(input.states),
    cities: pick(input.cities),
    // Stage codes are database configuration, so custom stages must survive segment save/edit.
    leadStatuses: pick(input.leadStatuses).map((v) => v.toUpperCase()),
    leadTypes: pick(input.leadTypes, LEAD_TYPES),
    temperatures: pick(input.temperatures, TEMPERATURES),
    sources: pick(input.sources).map((v) => v.toUpperCase()),
    primeOnly: Boolean(input.primeOnly),
    openLeadOnly: Boolean(input.openLeadOnly),
    inactiveDays: Number.isFinite(inactive) && inactive > 0 ? Math.min(3650, Math.round(inactive)) : null,
  };
};

/** Customers matching the filters. Do-not-contact contacts are always excluded. */
export const segmentWhere = (f: SegmentFilters, terminalStatuses: readonly string[] = ['WON', 'LOST']): Prisma.UserWhereInput => {
  const and: Prisma.UserWhereInput[] = [
    { status: 'ACTIVE' },
    { OR: [{ role: 'CUSTOMER' }, { crmProfile: { isNot: null } }] },
    { NOT: { crmProfile: { doNotContact: true } } },
  ];
  if (f.lifecycles.length) and.push({ crmProfile: { lifecycle: { in: f.lifecycles as (typeof LIFECYCLES)[number][] } } });
  if (f.contactTypes.length) and.push({ crmProfile: { contactTypes: { hasSome: f.contactTypes } } });
  if (f.tags.length) and.push({ crmProfile: { tags: { hasSome: f.tags } } });
  if (f.states.length) and.push({ OR: f.states.map((state) => ({ state: { equals: state, mode: 'insensitive' as const } })) });
  if (f.cities.length) and.push({ OR: f.cities.map((city) => ({ city: { equals: city, mode: 'insensitive' as const } })) });
  if (f.primeOnly) and.push({ customerPrimeSubscriptions: { some: { status: 'ACTIVE' } } });
  const leadAnd: Prisma.LeadWhereInput[] = [{ mergedIntoId: null }];
  if (f.leadStatuses.length) leadAnd.push({ status: { in: f.leadStatuses } });
  if (f.openLeadOnly) leadAnd.push({ status: { notIn: [...terminalStatuses] } });
  if (f.leadTypes.length) leadAnd.push({ leadType: { in: f.leadTypes as (typeof LEAD_TYPES)[number][] } });
  if (f.temperatures.length) leadAnd.push({ temperature: { in: f.temperatures as (typeof TEMPERATURES)[number][] } });
  if (f.sources.length) leadAnd.push({ source: { in: f.sources } });
  if (leadAnd.length > 1) and.push({ leads: { some: { AND: leadAnd } } });
  if (f.inactiveDays) {
    const cutoff = new Date(Date.now() - f.inactiveDays * 24 * 60 * 60 * 1000);
    and.push({ leads: { none: { lastActivityAt: { gte: cutoff } } } });
  }
  return { AND: and };
};

const requireCampaigns = (access: CrmAccess) => {
  if (!access.canCampaigns) throw forbidden('You do not have permission to manage CRM segments and campaigns.');
};

export const listSegments = async (access: CrmAccess) => {
  requireCampaigns(access);
  const segments = await prisma.crmSegment.findMany({ orderBy: { createdAt: 'desc' } });
  const { terminal } = await listPipelineStageStatusSets();
  return Promise.all(segments.map(async (segment) => ({ ...segment, count: await prisma.user.count({ where: segmentWhere(readSegmentFilters(segment.filters), terminal) }) })));
};

export const saveSegment = async (access: CrmAccess, body: Record<string, unknown>, id?: string) => {
  requireCampaigns(access);
  const name = textOrNull(body.name, 120);
  if (!name) throw badRequest('Name the segment.');
  const data = { name, description: textOrNull(body.description, 500), filters: readSegmentFilters(body.filters) as unknown as Prisma.InputJsonValue };
  if (id) return prisma.crmSegment.update({ where: { id }, data });
  return prisma.crmSegment.create({ data: { ...data, createdById: access.userId } });
};

export const deleteSegment = async (access: CrmAccess, id: string) => {
  requireCampaigns(access);
  await prisma.crmSegment.delete({ where: { id } });
  return { deleted: true };
};

export const previewSegment = async (access: CrmAccess, body: Record<string, unknown>) => {
  requireCampaigns(access);
  const { terminal } = await listPipelineStageStatusSets();
  const where = segmentWhere(readSegmentFilters(body.filters), terminal);
  const [count, sample] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, take: 25, orderBy: { createdAt: 'desc' }, select: contactSelect }),
  ]);
  return { count, sample };
};

/** Creates a DRAFT WhatsApp campaign (opted-in phones only); it is confirmed on the WhatsApp page. */
export const segmentCampaign = async (access: CrmAccess, id: string, body: Record<string, unknown>) => {
  requireCampaigns(access);
  const segment = await prisma.crmSegment.findUnique({ where: { id } });
  if (!segment) throw notFound('Segment not found.');
  const templateId = textOrNull(body.templateId, 60);
  if (!templateId) throw badRequest('Choose an approved marketing template.');
  const { terminal } = await listPipelineStageStatusSets();
  const users = await prisma.user.findMany({ where: segmentWhere(readSegmentFilters(segment.filters), terminal), select: { id: true }, take: 5000 });
  try {
    const result = await createWhatsAppCampaignForUsers({
      name: textOrNull(body.name, 120) || `CRM: ${segment.name}`,
      templateId,
      actorUserId: access.userId,
      userIds: users.map((u) => u.id),
      audienceFilters: { crmSegmentId: segment.id, crmSegmentName: segment.name },
    });
    return { campaignId: result.campaign.id, selected: result.selected, optedIn: result.optedIn, recipients: result.campaign._count.recipients };
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Could not create the campaign.');
  }
};
