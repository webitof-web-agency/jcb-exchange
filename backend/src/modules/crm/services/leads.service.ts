import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { canTouchLead, leadScopeWhere, type CrmAccess } from '../access';
import { badRequest, conflict, forbidden, notFound } from '../http';
import {
  addMinutes,
  fitWorkingHours,
  FOLLOW_UP_TYPES,
  istDayStart,
  isClosedStatus,
  LEAD_STATUSES,
  LEAD_TYPES,
  needsNextFollowUp,
  oneOf,
  PRIORITIES,
  slaDueAt,
  TEMPERATURES,
} from '../rules';
import { announceAssignment, autoAssignLead, moveFollowUps } from './assignment.service';
import {
  assertAssignableStaff,
  contactSelect,
  dateOrNull,
  decimalOrNull,
  intOrNull,
  logLeadActivity,
  pageArgs,
  platformRecipientId,
  staffSelect,
  stringList,
  syncNextFollowUp,
  textOrNull,
  toNumber,
  type Db,
} from './common';
import { findOrCreateContact } from './contacts.service';
import { findMatchingListings } from './matching.service';
import { leadTypeLabel, notifyUsers, sendCrmMessage } from './notify.service';
import { rescoreLead } from './scoring.service';
import { getCrmConfig, type CrmConfig } from './settings.service';
import { getListingFinalPrice, listingPricingSelect } from '../../../utils/listingPricing';

export const NEXT_FOLLOW_UP_REQUIRED = 'NEXT_FOLLOW_UP_REQUIRED';

const listSelect = {
  id: true, status: true, leadType: true, source: true, priority: true, temperature: true, score: true, enquiryType: true,
  message: true, createdAt: true, updatedAt: true, assignedAt: true, nextFollowUpAt: true, lastContactedAt: true, lastActivityAt: true,
  firstResponseAt: true, slaDueAt: true, slaBreachedAt: true, closedAt: true, lostReason: true, tags: true, expectedValue: true, wonAmount: true,
  budgetMin: true, budgetMax: true, requirementCity: true, requirementState: true, listingId: true, listingTitleSnapshot: true, listingPriceSnapshot: true,
  customer: { select: contactSelect },
  owner: { select: staffSelect },
  dealer: { select: { id: true, name: true, role: true } },
} satisfies Prisma.LeadSelect;

type MoneyFields = {
  expectedValue?: Prisma.Decimal | null;
  wonAmount?: Prisma.Decimal | null;
  budgetMin?: Prisma.Decimal | null;
  budgetMax?: Prisma.Decimal | null;
  listingPriceSnapshot?: Prisma.Decimal | null;
};

/** Decimal money columns → numbers for JSON. */
export const serializeLead = <T extends MoneyFields>(lead: T) => ({
  ...lead,
  expectedValue: toNumber(lead.expectedValue ?? null),
  wonAmount: toNumber(lead.wonAmount ?? null),
  budgetMin: toNumber(lead.budgetMin ?? null),
  budgetMax: toNumber(lead.budgetMax ?? null),
  listingPriceSnapshot: toNumber(lead.listingPriceSnapshot ?? null),
});

/** Filters shared by list, board and export. */
export const leadFilterWhere = (access: CrmAccess, query: Record<string, string>): Prisma.LeadWhereInput => {
  const and: Prisma.LeadWhereInput[] = [leadScopeWhere(access), { mergedIntoId: null }];
  const list = (key: string) => (query[key] || '').split(',').map((v) => v.trim().toUpperCase()).filter(Boolean);
  const statuses = list('status').filter((s) => (LEAD_STATUSES as readonly string[]).includes(s));
  if (statuses.length) and.push({ status: { in: statuses as Prisma.EnumLeadStatusFilter['in'] & string[] } });
  else if (query.view === 'open') and.push({ status: { notIn: ['WON', 'LOST'] } });
  else if (query.view === 'closed') and.push({ status: { in: ['WON', 'LOST'] } });
  const types = list('leadType').filter((s) => (LEAD_TYPES as readonly string[]).includes(s));
  if (types.length) and.push({ leadType: { in: types as (typeof LEAD_TYPES)[number][] } });
  const priorities = list('priority').filter((s) => (PRIORITIES as readonly string[]).includes(s));
  if (priorities.length) and.push({ priority: { in: priorities as (typeof PRIORITIES)[number][] } });
  const temps = list('temperature').filter((s) => (TEMPERATURES as readonly string[]).includes(s));
  if (temps.length) and.push({ temperature: { in: temps as (typeof TEMPERATURES)[number][] } });
  const sources = list('source');
  if (sources.length) and.push({ source: { in: sources } });
  if (query.tag) and.push({ tags: { has: query.tag } });
  if (query.ownerId === 'me') and.push({ ownerId: access.userId });
  else if (query.ownerId === 'none') and.push({ ownerId: null });
  else if (query.ownerId) and.push({ ownerId: query.ownerId });
  if (query.recipient === 'platform') and.push({ dealer: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } } });
  else if (query.recipient === 'partner') and.push({ dealer: { role: 'PARTNER' } });
  const now = new Date();
  const tomorrow = addMinutes(istDayStart(now), 24 * 60);
  if (query.followUp === 'overdue') and.push({ nextFollowUpAt: { lt: now } });
  else if (query.followUp === 'today') and.push({ nextFollowUpAt: { gte: now, lt: tomorrow } });
  else if (query.followUp === 'upcoming') and.push({ nextFollowUpAt: { gte: tomorrow } });
  else if (query.followUp === 'none') and.push({ nextFollowUpAt: null, status: { notIn: ['WON', 'LOST'] } });
  if (query.sla === 'breached') and.push({ slaBreachedAt: { not: null }, firstResponseAt: null });
  const from = dateOrNull(query.from, 'from date');
  const to = dateOrNull(query.to, 'to date');
  if (from || to) and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  const q = query.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, '');
    and.push({
      OR: [
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        ...(digits.length >= 4 ? [{ customer: { mobile: { contains: digits.slice(-10) } } }] : []),
        { listingTitleSnapshot: { contains: q, mode: 'insensitive' } },
        { message: { contains: q, mode: 'insensitive' } },
        { requirementNotes: { contains: q, mode: 'insensitive' } },
        { requirementCity: { contains: q, mode: 'insensitive' } },
      ],
    });
  }
  return { AND: and };
};

const orderFor = (sort: string | undefined): Prisma.LeadOrderByWithRelationInput[] => {
  switch (sort) {
    case 'followup': return [{ nextFollowUpAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }];
    case 'score': return [{ score: 'desc' }, { createdAt: 'desc' }];
    case 'activity': return [{ lastActivityAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];
    case 'oldest': return [{ createdAt: 'asc' }];
    default: return [{ createdAt: 'desc' }];
  }
};

export const listLeads = async (access: CrmAccess, query: Record<string, string>) => {
  const { page, pageSize, skip, take } = pageArgs(query.page, query.pageSize);
  const where = leadFilterWhere(access, query);
  const [total, items, byStatus] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({ where, orderBy: orderFor(query.sort), skip, take, select: listSelect }),
    prisma.lead.groupBy({ by: ['status'], where: { AND: [leadScopeWhere(access), { mergedIntoId: null }] }, _count: { _all: true } }),
  ]);
  return {
    page,
    pageSize,
    total,
    items: items.map(serializeLead),
    statusCounts: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
  };
};

/** Kanban: every status column with its count and first 40 cards. */
export const boardLeads = async (access: CrmAccess, query: Record<string, string>) => {
  const { status: _ignored, view: _view, ...rest } = query;
  const base = leadFilterWhere(access, rest);
  const columns = await Promise.all(LEAD_STATUSES.map(async (status) => {
    const where: Prisma.LeadWhereInput = { AND: [base, { status }] };
    const [count, cards, value] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({ where, orderBy: orderFor(query.sort || 'followup'), take: 40, select: listSelect }),
      prisma.lead.aggregate({ where, _sum: { expectedValue: true } }),
    ]);
    return { status, count, expectedValue: toNumber(value._sum.expectedValue), cards: cards.map(serializeLead) };
  }));
  return { columns };
};

const requireLead = async (access: CrmAccess, id: string) => {
  const lead = await prisma.lead.findUnique({ where: { id }, select: { id: true, dealerId: true, ownerId: true, status: true, customerId: true, mergedIntoId: true } });
  if (!lead || !canTouchLead(access, lead)) throw notFound('Lead not found.');
  return lead;
};

export const getLead = async (access: CrmAccess, id: string) => {
  await requireLead(access, id);
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      customer: { select: { ...contactSelect, crmProfile: { select: { companyName: true, lifecycle: true, tags: true, doNotContact: true, notes: true, alternatePhone: true } } } },
      owner: { select: staffSelect },
      dealer: { select: { id: true, name: true, role: true, mobile: true, whatsappNumber: true } },
      listing: {
        select: {
          id: true, title: true, ...listingPricingSelect, status: true, manufacturingYear: true, locationCity: true, locationState: true,
          brand: { select: { name: true } }, model: { select: { name: true } }, category: { select: { name: true } },
        },
      },
      activities: { orderBy: { createdAt: 'desc' }, take: 200, include: { actor: { select: { id: true, name: true, role: true } } } },
      followUps: { orderBy: { dueAt: 'desc' }, include: { owner: { select: staffSelect } } },
    },
  });
  if (!lead) throw notFound('Lead not found.');
  const [otherLeads, matches, catalog, wonDeal, payments] = await Promise.all([
    prisma.lead.findMany({
      where: { AND: [{ customerId: lead.customerId, id: { not: lead.id }, mergedIntoId: null }, leadScopeWhere(access)] },
      select: { id: true, status: true, leadType: true, createdAt: true, listingTitleSnapshot: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    access.isPartner ? Promise.resolve([]) : findMatchingListings(lead, { limit: 6, ...(lead.listingId ? { excludeIds: [lead.listingId] } : {}) }),
    Promise.all([
      lead.categoryId ? prisma.category.findUnique({ where: { id: lead.categoryId }, select: { id: true, name: true } }) : null,
      lead.brandId ? prisma.brand.findUnique({ where: { id: lead.brandId }, select: { id: true, name: true } }) : null,
      lead.modelId ? prisma.model.findUnique({ where: { id: lead.modelId }, select: { id: true, name: true } }) : null,
    ]),
    lead.wonSellAccountId ? prisma.sellAccount.findUnique({ where: { id: lead.wonSellAccountId }, select: { id: true, recordNumber: true, listingTitle: true, sellAmount: true } }) : null,
    // Listing payments by this customer for the enquired machine (verified from the lead, as on the old enquiry page).
    !access.isPartner && lead.listingId
      ? prisma.listingPaymentSubmission.findMany({
        where: { listingId: lead.listingId, buyerId: lead.customerId },
        orderBy: { submittedAt: 'desc' },
        take: 10,
        select: { id: true, status: true, amount: true, method: true, transactionRef: true, paymentNote: true, receiptUrl: true, submittedAt: true, rejectionReason: true },
      })
      : Promise.resolve([]),
  ]);
  return {
    lead: {
      ...serializeLead(lead),
      listing: lead.listing
        ? {
          id: lead.listing.id, title: lead.listing.title, status: lead.listing.status, manufacturingYear: lead.listing.manufacturingYear,
          locationCity: lead.listing.locationCity, locationState: lead.listing.locationState,
          brand: lead.listing.brand, model: lead.listing.model, category: lead.listing.category,
          price: getListingFinalPrice(lead.listing),
        }
        : null,
      requirement: { category: catalog[0], brand: catalog[1], model: catalog[2] },
      wonDeal: wonDeal ? { ...wonDeal, sellAmount: toNumber(wonDeal.sellAmount) } : null,
    },
    otherLeads,
    matches,
    payments: payments.map((payment) => ({ ...payment, amount: toNumber(payment.amount) })),
  };
};

const requirementData = (body: Record<string, unknown>) => {
  const data: Prisma.LeadUncheckedUpdateInput = {};
  if ('categoryId' in body) data.categoryId = textOrNull(body.categoryId, 60);
  if ('brandId' in body) data.brandId = textOrNull(body.brandId, 60);
  if ('modelId' in body) data.modelId = textOrNull(body.modelId, 60);
  if ('yearFrom' in body) data.yearFrom = intOrNull(body.yearFrom);
  if ('yearTo' in body) data.yearTo = intOrNull(body.yearTo);
  if ('budgetMin' in body) data.budgetMin = decimalOrNull(body.budgetMin);
  if ('budgetMax' in body) data.budgetMax = decimalOrNull(body.budgetMax);
  if ('requirementState' in body) data.requirementState = textOrNull(body.requirementState, 80);
  if ('requirementCity' in body) data.requirementCity = textOrNull(body.requirementCity, 80);
  if ('requirementNotes' in body) data.requirementNotes = textOrNull(body.requirementNotes, 5000);
  if ('expectedValue' in body) data.expectedValue = decimalOrNull(body.expectedValue);
  if ('matchAlertsEnabled' in body) data.matchAlertsEnabled = Boolean(body.matchAlertsEnabled);
  if ('tags' in body) data.tags = stringList(body.tags);
  return data;
};

type FollowUpSpec = { type: (typeof FOLLOW_UP_TYPES)[number]; dueAt: Date; notes: string | null; title: string | null };

const readFollowUpSpec = (value: unknown): FollowUpSpec | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const dueAt = dateOrNull(input.dueAt, 'follow-up date');
  if (!dueAt) return null;
  if (dueAt.getTime() < Date.now() - 5 * 60 * 1000) throw badRequest('The next follow-up must be in the future.');
  return { type: oneOf(FOLLOW_UP_TYPES, input.type) ?? 'CALL', dueAt, notes: textOrNull(input.notes, 2000), title: textOrNull(input.title, 200) };
};

export const createFollowUpRow = async (
  db: Db,
  lead: { id: string; customerId: string; ownerId: string | null; dealerId: string; dealerRole?: string },
  spec: FollowUpSpec,
  actorId: string | null,
  autoCreated = false,
) => {
  // Partner leads remind the partner; platform leads remind the owner (or nobody until assigned).
  const ownerId = lead.ownerId ?? (lead.dealerRole === 'PARTNER' ? lead.dealerId : null);
  const row = await db.crmFollowUp.create({
    data: {
      leadId: lead.id,
      contactUserId: lead.customerId,
      ownerId,
      type: spec.type,
      dueAt: spec.dueAt,
      title: spec.title,
      notes: spec.notes,
      autoCreated,
      createdById: actorId,
    },
  });
  await syncNextFollowUp(db, lead.id);
  return row;
};

export const firstFollowUpSpec = (config: CrmConfig, from = new Date()): FollowUpSpec => ({
  type: 'CALL',
  dueAt: fitWorkingHours(addMinutes(from, config.automation.firstFollowUpMinutes), config.workingHours),
  notes: null,
  title: 'First call',
});

export const createLead = async (access: CrmAccess, body: Record<string, unknown>) =>
  getLead(access, await createLeadRecord(access, body));

/** Creates the lead and its first follow-up; returns the new lead id (used by forms and imports). */
export const createLeadRecord = async (access: CrmAccess, body: Record<string, unknown>, preloaded?: CrmConfig) => {
  if (!access.canManage) throw forbidden();
  const config = preloaded ?? await getCrmConfig();
  const leadType = oneOf(LEAD_TYPES, body.leadType) ?? 'BUY';
  const priority = oneOf(PRIORITIES, body.priority) ?? 'MEDIUM';
  const source = (textOrNull(body.source, 40) || 'PHONE').toUpperCase();
  const followUp = readFollowUpSpec(body.followUp);
  const contactInput = (body.contact && typeof body.contact === 'object' ? body.contact : body) as Record<string, unknown>;
  const listingId = textOrNull(body.listingId, 60);
  const listing = listingId
    ? await prisma.listing.findUnique({ where: { id: listingId }, select: { id: true, title: true, status: true, ...listingPricingSelect, locationCity: true, locationState: true, partnerId: true, categoryId: true, brandId: true, modelId: true } })
    : null;
  if (listingId && !listing) throw badRequest('Listing not found.');
  if (access.isPartner && listing && listing.partnerId !== access.userId) throw forbidden('You can only attach your own listings.');

  let ownerId: string | null = null;
  const requestedOwner = textOrNull(body.ownerId, 60);
  if (!access.isPartner) {
    if (requestedOwner && requestedOwner !== 'none') {
      if (requestedOwner !== access.userId && !access.canAssign) throw forbidden('Only managers can assign leads to others.');
      ownerId = requestedOwner;
    } else if (requestedOwner !== 'none' || !access.canAssign) {
      ownerId = access.userId;
    }
  }
  const dealerId = access.isPartner ? access.userId : await platformRecipientId();

  const created = await prisma.$transaction(async (tx) => {
    if (ownerId) await assertAssignableStaff(tx, ownerId);
    const { user: customer } = await findOrCreateContact(tx, { ...contactInput, source }, access.userId);
    if (body.allowDuplicate !== true) {
      const duplicate = await tx.lead.findFirst({
        where: {
          AND: [
            { customerId: customer.id, status: { notIn: ['WON', 'LOST'] }, mergedIntoId: null, leadType },
            listing ? { listingId: listing.id } : {},
            leadScopeWhere(access),
          ],
        },
        select: { id: true },
      });
      if (duplicate) throw conflict('This customer already has an open lead of this type.', { code: 'DUPLICATE_LEAD', leadId: duplicate.id });
    }
    const now = new Date();
    const lead = await tx.lead.create({
      data: {
        ...(requirementData(body) as Omit<Prisma.LeadUncheckedCreateInput, 'customerId' | 'dealerId' | 'enquiryType'>),
        customerId: customer.id,
        dealerId,
        listingId: listing?.id ?? null,
        enquiryType: 'CRM_MANUAL',
        message: textOrNull(body.message, 5000),
        leadType,
        source,
        priority,
        ownerId,
        assignedAt: ownerId ? now : null,
        createdById: access.userId,
        slaDueAt: slaDueAt(now, priority, config.sla),
        lastActivityAt: now,
        ...(listing
          ? {
            listingTitleSnapshot: listing.title,
            listingStatusSnapshot: listing.status,
            listingPriceSnapshot: getListingFinalPrice(listing),
            listingLocationCitySnapshot: listing.locationCity,
            listingLocationStateSnapshot: listing.locationState,
            categoryId: listing.categoryId,
            brandId: listing.brandId,
            modelId: listing.modelId,
          }
          : {}),
      },
      select: { id: true, customerId: true, ownerId: true, dealerId: true },
    });
    await tx.leadActivity.create({
      data: { leadId: lead.id, actorId: access.userId, type: 'CREATED', title: 'Lead created in CRM', content: textOrNull(body.message, 5000), metadata: { source, leadType } },
    });
    const spec = followUp ?? (config.requireNextFollowUp ? firstFollowUpSpec(config, now) : null);
    if (spec) await createFollowUpRow(tx, { ...lead, dealerRole: access.isPartner ? 'PARTNER' : 'SUPER_ADMIN' }, spec, access.userId, !followUp);
    return lead;
  });

  await rescoreLead(created.id).catch(() => null);
  if (!created.ownerId && !access.isPartner && config.automation.enabled && config.automation.autoAssign) {
    await autoAssignLead(created.id).catch((error) => console.error('[crm] auto-assign failed:', error));
  } else if (created.ownerId && created.ownerId !== access.userId) {
    await announceAssignment(created.id, created.ownerId, 'Created and assigned to you.');
  }
  await acknowledgeLead(created.id, config);
  return created.id;
};

/** Optional WhatsApp/SMS thank-you to the customer (automation + approved template required). */
const acknowledgeLead = async (leadId: string, config: CrmConfig) => {
  if (!config.automation.enabled || !config.automation.leadAcknowledgement) return;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, leadType: true, listingTitleSnapshot: true, customer: { select: { name: true, mobile: true, whatsappNumber: true, crmProfile: { select: { doNotContact: true } } } } },
  });
  if (!lead || lead.customer.crmProfile?.doNotContact) return;
  const enquiry = lead.listingTitleSnapshot || leadTypeLabel(lead.leadType);
  await sendCrmMessage({
    event: 'CRM_LEAD_ACKNOWLEDGEMENT',
    recipientType: 'CUSTOMER',
    phone: lead.customer.whatsappNumber || lead.customer.mobile,
    entityId: lead.id,
    values: [lead.customer.name, enquiry],
    variables: { customerName: lead.customer.name, enquiry },
  });
};

/**
 * Hook for leads created outside the CRM (website callback, Prime call/WhatsApp click, public forms).
 * Never throws: the public flow must not fail because of CRM extras.
 */
export const onLeadCaptured = async (leadId: string, options: { source: string; repeat?: boolean }) => {
  try {
    const config = await getCrmConfig();
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, createdAt: true, priority: true, ownerId: true, slaDueAt: true, customerId: true, dealerId: true, dealer: { select: { role: true } }, customer: { select: { name: true } }, listingTitleSnapshot: true, leadType: true },
    });
    if (!lead) return;
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        ...(options.repeat ? {} : { source: options.source }),
        lastActivityAt: new Date(),
        ...(lead.slaDueAt ? {} : { slaDueAt: slaDueAt(lead.createdAt, lead.priority, config.sla) }),
      },
    });
    await prisma.crmContactProfile.upsert({ where: { userId: lead.customerId }, create: { userId: lead.customerId, source: options.source }, update: {} });
    const isPlatform = lead.dealer.role !== 'PARTNER';
    if (config.automation.enabled && config.automation.autoFirstFollowUp) {
      const pending = await prisma.crmFollowUp.count({ where: { leadId: lead.id, status: 'PENDING' } });
      if (!pending) {
        await prisma.$transaction((tx) => createFollowUpRow(tx, { ...lead, dealerRole: lead.dealer.role }, firstFollowUpSpec(config), null, true));
      }
    }
    let ownerId = lead.ownerId;
    if (!ownerId && isPlatform && config.automation.enabled && config.automation.autoAssign) ownerId = await autoAssignLead(lead.id);
    const what = lead.listingTitleSnapshot || leadTypeLabel(lead.leadType);
    if (ownerId && options.repeat) {
      await notifyUsers([ownerId], { title: 'Repeat enquiry', message: `${lead.customer.name || 'A customer'} enquired again — ${what}.`, type: 'CRM_REPEAT_ENQUIRY', leadId: lead.id });
    } else if (!ownerId && isPlatform && !options.repeat) {
      const managers = config.missed.managerUserIds.length
        ? config.missed.managerUserIds
        : (await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' }, select: { id: true } })).map((u) => u.id);
      await notifyUsers(managers, { title: 'New unassigned lead', message: `${lead.customer.name || 'A customer'} — ${what}. Assign it in CRM.`, type: 'CRM_NEW_LEAD', leadId: lead.id, push: false });
    }
    await rescoreLead(lead.id).catch(() => null);
    if (!options.repeat) await acknowledgeLead(lead.id, config);
  } catch (error) {
    console.error('[crm] onLeadCaptured failed:', error);
  }
};

export const updateLead = async (access: CrmAccess, id: string, body: Record<string, unknown>) => {
  if (!access.canManage) throw forbidden();
  await requireLead(access, id);
  const data: Prisma.LeadUncheckedUpdateInput = requirementData(body);
  const changes: string[] = Object.keys(data);
  if ('leadType' in body) { const v = oneOf(LEAD_TYPES, body.leadType); if (v) { data.leadType = v; changes.push('leadType'); } }
  if ('priority' in body) { const v = oneOf(PRIORITIES, body.priority); if (v) { data.priority = v; changes.push('priority'); } }
  if ('source' in body) { const v = textOrNull(body.source, 40); if (v) { data.source = v.toUpperCase(); changes.push('source'); } }
  if ('message' in body) { data.message = textOrNull(body.message, 5000); changes.push('message'); }
  if (!changes.length) throw badRequest('Nothing to update.');
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id }, data });
    await logLeadActivity(tx, { leadId: id, actorId: access.userId, type: 'UPDATED', title: 'Lead details updated', metadata: { fields: changes } });
  });
  await rescoreLead(id).catch(() => null);
  return getLead(access, id);
};

export const changeStatus = async (access: CrmAccess, id: string, body: Record<string, unknown>) => {
  if (!access.canManage) throw forbidden();
  const current = await requireLead(access, id);
  const status = oneOf(LEAD_STATUSES, body.status);
  if (!status) throw badRequest('Choose a valid status.');
  const config = await getCrmConfig();
  const note = textOrNull(body.note, 2000);
  const lostReason = textOrNull(body.lostReason, 120);
  if (status === 'LOST' && !lostReason) throw badRequest('Choose why the lead was lost.');
  const next = readFollowUpSpec(body.nextFollowUp);
  const closing = isClosedStatus(status);

  await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUniqueOrThrow({ where: { id }, select: { id: true, status: true, customerId: true, ownerId: true, dealerId: true, firstResponseAt: true, dealer: { select: { role: true } } } });
    if (!closing && needsNextFollowUp(status, config.requireNextFollowUp) && !next) {
      const pending = await tx.crmFollowUp.count({ where: { leadId: id, status: 'PENDING' } });
      if (!pending) throw badRequest('Schedule the next follow-up for this open lead.', { code: NEXT_FOLLOW_UP_REQUIRED });
    }
    const wonSellAccountId = textOrNull(body.wonSellAccountId, 60);
    if (wonSellAccountId && !(await tx.sellAccount.findUnique({ where: { id: wonSellAccountId }, select: { id: true } }))) throw badRequest('Sell account not found.');
    await tx.lead.update({
      where: { id },
      data: {
        status,
        ...(closing ? { closedAt: new Date() } : { closedAt: null, lostReason: null }),
        ...(status === 'LOST' ? { lostReason } : {}),
        ...(status === 'WON'
          ? {
            wonAmount: decimalOrNull(body.wonAmount),
            wonSellAccountId,
            linkedPartnerProfileId: textOrNull(body.linkedPartnerProfileId, 60),
          }
          : {}),
        ...(lead.firstResponseAt || status === 'NEW' ? {} : { firstResponseAt: new Date() }),
      },
    });
    if (closing) {
      await tx.crmFollowUp.updateMany({ where: { leadId: id, status: 'PENDING' }, data: { status: 'CANCELLED', outcomeNotes: `Lead marked ${status.toLowerCase()}.`, completedAt: new Date(), completedById: access.userId } });
      if (status === 'WON') await tx.crmContactProfile.upsert({ where: { userId: lead.customerId }, create: { userId: lead.customerId, lifecycle: 'CUSTOMER' }, update: { lifecycle: 'CUSTOMER' } });
    }
    if (next) await createFollowUpRow(tx, { ...lead, dealerRole: lead.dealer.role }, next, access.userId);
    await syncNextFollowUp(tx, id);
    await logLeadActivity(tx, {
      leadId: id,
      actorId: access.userId,
      type: 'STATUS_CHANGE',
      title: `Status changed to ${status.replace(/_/g, ' ').toLowerCase()}`,
      content: [note, status === 'LOST' ? `Reason: ${lostReason}` : null].filter(Boolean).join('\n') || null,
      metadata: { from: current.status, to: status, ...(lostReason ? { lostReason } : {}) },
    });
  });
  await rescoreLead(id).catch(() => null);
  return getLead(access, id);
};

export const assignLead = async (access: CrmAccess, id: string, body: Record<string, unknown>) => {
  if (!access.canAssign) throw forbidden('Only managers can assign leads.');
  const current = await requireLead(access, id);
  const ownerId = textOrNull(body.ownerId, 60);
  await prisma.$transaction(async (tx) => {
    if (ownerId) await assertAssignableStaff(tx, ownerId);
    await tx.lead.update({ where: { id }, data: { ownerId, assignedAt: ownerId ? new Date() : null } });
    await moveFollowUps(tx, id, current.ownerId, ownerId);
    await logLeadActivity(tx, {
      leadId: id,
      actorId: access.userId,
      type: 'ASSIGNED',
      title: ownerId ? 'Lead reassigned' : 'Lead unassigned',
      content: textOrNull(body.reason, 500),
      metadata: { from: current.ownerId, to: ownerId },
    });
  });
  if (ownerId && ownerId !== access.userId) await announceAssignment(id, ownerId, textOrNull(body.reason, 200) || 'Assigned by a manager.');
  return getLead(access, id);
};

const ACTIVITY_TYPES = ['NOTE', 'CALL', 'WHATSAPP', 'SMS', 'EMAIL', 'VISIT', 'INSPECTION', 'MEETING'];
const CONTACT_TYPES = ['CALL', 'WHATSAPP', 'SMS', 'EMAIL', 'VISIT', 'INSPECTION', 'MEETING'];

export const addLeadActivity = async (access: CrmAccess, id: string, body: Record<string, unknown>) => {
  if (!access.canManage) throw forbidden();
  await requireLead(access, id);
  const type = String(body.type || 'NOTE').toUpperCase();
  if (!ACTIVITY_TYPES.includes(type)) throw badRequest('Unknown activity type.');
  const content = textOrNull(body.content, 5000);
  if (!content) throw badRequest('Write what happened.');
  const metadataInput = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {};
  const metadata = {
    ...(intOrNull(metadataInput.durationSec) !== null ? { durationSec: intOrNull(metadataInput.durationSec) } : {}),
    ...(textOrNull(metadataInput.direction, 20) ? { direction: textOrNull(metadataInput.direction, 20) } : {}),
    ...(textOrNull(metadataInput.outcome, 40) ? { outcome: textOrNull(metadataInput.outcome, 40) } : {}),
  };
  const titles: Record<string, string> = { NOTE: 'Internal note', CALL: 'Call logged', WHATSAPP: 'WhatsApp message', SMS: 'SMS sent', EMAIL: 'Email sent', VISIT: 'Visit logged', INSPECTION: 'Inspection note', MEETING: 'Meeting logged' };
  await prisma.$transaction((tx) => logLeadActivity(tx, {
    leadId: id,
    actorId: access.userId,
    type,
    title: textOrNull(body.title, 200) || titles[type] || 'Activity',
    content,
    metadata,
    contacted: CONTACT_TYPES.includes(type),
  }));
  return getLead(access, id);
};

export const bulkLeads = async (access: CrmAccess, body: Record<string, unknown>) => {
  const ids = stringList(body.ids, 200);
  if (!ids.length) throw badRequest('Select at least one lead.');
  const action = String(body.action || '');
  const scoped = await prisma.lead.findMany({ where: { AND: [{ id: { in: ids } }, leadScopeWhere(access)] }, select: { id: true, ownerId: true } });
  if (!scoped.length) throw notFound('None of the selected leads are available to you.');
  if (action === 'assign') {
    if (!access.canAssign) throw forbidden('Only managers can assign leads.');
    const ownerId = textOrNull(body.ownerId, 60);
    if (ownerId) await assertAssignableStaff(prisma, ownerId);
    for (const lead of scoped) {
      await prisma.$transaction(async (tx) => {
        await tx.lead.update({ where: { id: lead.id }, data: { ownerId, assignedAt: ownerId ? new Date() : null } });
        await moveFollowUps(tx, lead.id, lead.ownerId, ownerId);
        await logLeadActivity(tx, { leadId: lead.id, actorId: access.userId, type: 'ASSIGNED', title: 'Bulk reassignment', metadata: { from: lead.ownerId, to: ownerId } });
      });
    }
    if (ownerId) await notifyUsers([ownerId], { title: `${scoped.length} leads assigned to you`, message: 'Open CRM to see them.', type: 'CRM_LEAD_ASSIGNED', tab: 'leads' });
  } else if (action === 'priority' || action === 'tag') {
    if (!access.canManage) throw forbidden();
    const priority = oneOf(PRIORITIES, body.priority);
    const tag = textOrNull(body.tag, 60);
    if (action === 'priority' && !priority) throw badRequest('Choose a priority.');
    if (action === 'tag' && !tag) throw badRequest('Enter a tag.');
    for (const lead of scoped) {
      await prisma.$transaction(async (tx) => {
        if (priority) await tx.lead.update({ where: { id: lead.id }, data: { priority } });
        if (tag) {
          const row = await tx.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { tags: true } });
          if (!row.tags.includes(tag)) await tx.lead.update({ where: { id: lead.id }, data: { tags: [...row.tags, tag] } });
        }
        await logLeadActivity(tx, { leadId: lead.id, actorId: access.userId, type: 'UPDATED', title: priority ? `Priority set to ${priority.toLowerCase()}` : `Tagged "${tag}"` });
      });
    }
  } else {
    throw badRequest('Unknown bulk action.');
  }
  return { updated: scoped.length };
};

/** Folds a duplicate into the surviving lead: timeline + follow-ups move, the duplicate closes as LOST. */
export const mergeLeads = async (access: CrmAccess, sourceId: string, body: Record<string, unknown>) => {
  if (access.isPartner || !access.canManage) throw forbidden();
  const targetId = textOrNull(body.targetId, 60);
  if (!targetId || targetId === sourceId) throw badRequest('Choose the lead to keep.');
  const [source, target] = await Promise.all([requireLead(access, sourceId), requireLead(access, targetId)]);
  if (source.mergedIntoId || target.mergedIntoId) throw badRequest('One of these leads is already merged.');
  await prisma.$transaction(async (tx) => {
    await tx.leadActivity.updateMany({ where: { leadId: sourceId }, data: { leadId: targetId } });
    await tx.crmFollowUp.updateMany({ where: { leadId: sourceId }, data: { leadId: targetId } });
    await tx.lead.update({ where: { id: sourceId }, data: { mergedIntoId: targetId, status: 'LOST', lostReason: 'Duplicate enquiry', closedAt: new Date(), nextFollowUpAt: null } });
    await syncNextFollowUp(tx, targetId);
    await logLeadActivity(tx, { leadId: targetId, actorId: access.userId, type: 'MERGED', title: 'Duplicate lead merged in', metadata: { mergedLeadId: sourceId } });
  });
  return getLead(access, targetId);
};

export const leadMatches = async (access: CrmAccess, id: string) => {
  await requireLead(access, id);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id } });
  return { matches: await findMatchingListings(lead, { limit: 20, ...(lead.listingId ? { excludeIds: [lead.listingId] } : {}) }) };
};
