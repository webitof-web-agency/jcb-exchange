import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { LEDGER_STATUSES } from '../../finance-hub/services/ledgerRules';
import { PAYABLE_KEYS, RECEIVABLE_KEYS } from '../../finance-hub/services/receivablesRules';
import { leadScopeWhere, type CrmAccess } from '../access';
import { badRequest, conflict, forbidden, notFound } from '../http';
import { LIFECYCLES, mobileVariants, normalizeMobile, oneOf } from '../rules';
import { contactSelect, pageArgs, stringList, textOrNull, toNumber, type Db } from './common';
import { selectContactPipelineStage } from '../contactStage';
import { listPipelineStageStatusSets } from './pipelineStages.service';

export type ContactInput = {
  name?: unknown;
  mobile?: unknown;
  email?: unknown;
  city?: unknown;
  state?: unknown;
  whatsappNumber?: unknown;
  source?: unknown;
};

const optionalContactPhone = (value: unknown, label: string) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const mobile = normalizeMobile(value);
  if (!mobile) throw badRequest(`Enter a valid 10-digit Indian ${label}.`);
  return mobile;
};

/** Finds a user by any stored phone format, or creates a CUSTOMER user. Never changes an existing role. */
export const findOrCreateContact = async (db: Db, input: ContactInput, actorId: string | null) => {
  const mobile = normalizeMobile(input.mobile);
  if (!mobile) throw badRequest('Enter a valid 10-digit Indian mobile number.');
  const name = textOrNull(input.name, 120);
  const city = textOrNull(input.city, 80);
  const state = textOrNull(input.state, 80);
  const email = textOrNull(input.email, 160)?.toLowerCase() ?? null;
  const whatsapp = optionalContactPhone(input.whatsappNumber, 'WhatsApp number');

  const existing = await db.user.findFirst({ where: { mobile: { in: mobileVariants(mobile) } }, select: { ...contactSelect, crmProfile: { select: { id: true } } } });
  let user;
  let created = false;
  if (existing) {
    // Only fill gaps; an existing account's own details win.
    user = await db.user.update({
      where: { id: existing.id },
      data: {
        ...(!existing.name && name ? { name } : {}),
        ...(!existing.city && city ? { city } : {}),
        ...(!existing.state && state ? { state } : {}),
        ...(!existing.whatsappNumber && whatsapp ? { whatsappNumber: whatsapp } : {}),
      },
      select: contactSelect,
    });
  } else {
    const emailFree = email ? !(await db.user.findUnique({ where: { email }, select: { id: true } })) : false;
    user = await db.user.create({
      data: {
        mobile,
        name: name || `Customer ${mobile.slice(-4)}`,
        city,
        state,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        ...(email && emailFree ? { email } : {}),
        // Creator is kept on the CRM profile, not User.createdById (that blocks staff deletion).
        ...(whatsapp ? { whatsappNumber: whatsapp } : {}),
      },
      select: contactSelect,
    });
    created = true;
  }
  if (!existing?.crmProfile) {
    await db.crmContactProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, source: textOrNull(input.source, 40), createdById: actorId },
      update: {},
    });
  }
  return { user, created };
};

const contactUniverse: Prisma.UserWhereInput = { OR: [{ role: 'CUSTOMER' }, { crmProfile: { isNot: null } }] };

/** Who can see a contact: everyone with "all"; others via a lead in their scope or profile ownership. */
const contactScopeWhere = (access: CrmAccess): Prisma.UserWhereInput => {
  if (access.canSeeAll) return {};
  const leadScope = leadScopeWhere(access);
  if (access.isPartner) return { leads: { some: leadScope } };
  return { OR: [{ leads: { some: leadScope } }, { crmProfile: { ownerId: access.userId } }] };
};

export const assertContactAccess = async (access: CrmAccess, userId: string) => {
  const found = await prisma.user.findFirst({ where: { AND: [{ id: userId }, contactScopeWhere(access)] }, select: { id: true } });
  if (!found) throw notFound('Contact not found.');
};

export const listContacts = async (access: CrmAccess, query: Record<string, string>) => {
  const { page, pageSize, skip, take } = pageArgs(query.page, query.pageSize);
  const { terminal } = await listPipelineStageStatusSets();
  const and: Prisma.UserWhereInput[] = [contactUniverse, contactScopeWhere(access)];
  const q = query.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, '');
    and.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        ...(digits.length >= 4 ? [{ mobile: { contains: digits.slice(-10) } }] : []),
        { crmProfile: { companyName: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }
  const lifecycle = oneOf(LIFECYCLES, query.lifecycle);
  if (lifecycle) and.push({ crmProfile: { lifecycle } });
  const pipelineStage = query.pipelineStage?.trim().toUpperCase();
  if (pipelineStage) {
    and.push({ leads: { some: { AND: [{ mergedIntoId: null }, { status: pipelineStage }, leadScopeWhere(access)] } } });
  }
  if (query.contactType) and.push({ crmProfile: { contactTypes: { has: query.contactType } } });
  if (query.tag) and.push({ crmProfile: { tags: { has: query.tag } } });
  if (query.ownerId === 'me') and.push({ crmProfile: { ownerId: access.userId } });
  else if (query.ownerId === 'none') and.push({ OR: [{ crmProfile: null }, { crmProfile: { ownerId: null } }] });
  else if (query.ownerId) and.push({ crmProfile: { ownerId: query.ownerId } });
  if (query.state) and.push({ state: { equals: query.state, mode: 'insensitive' } });
  if (query.openLeads === 'yes') and.push({ leads: { some: { status: { notIn: [...terminal] }, mergedIntoId: null } } });

  const where: Prisma.UserWhereInput = { AND: and };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        ...contactSelect,
        createdAt: true,
        crmProfile: { select: { companyName: true, lifecycle: true, contactTypes: true, tags: true, doNotContact: true, owner: { select: { id: true, name: true } } } },
        leads: { where: { mergedIntoId: null }, select: { id: true, status: true, createdAt: true, nextFollowUpAt: true, pipelineStage: { select: { code: true, name: true, color: true, isTerminal: true } } }, orderBy: { createdAt: 'desc' }, take: 20 },
        customerPrimeSubscriptions: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 },
      },
    }),
  ]);
  return {
    page,
    pageSize,
    total,
    items: users.map(({ leads, customerPrimeSubscriptions, ...user }) => ({
      ...user,
      isPrime: customerPrimeSubscriptions.length > 0,
      leadCount: leads.length,
      openLeadCount: leads.filter((lead) => !terminal.includes(lead.status)).length,
      lastLeadAt: leads[0]?.createdAt ?? null,
      nextFollowUpAt: leads.map((lead) => lead.nextFollowUpAt).filter((date): date is Date => Boolean(date)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
      pipelineStage: selectContactPipelineStage(leads, terminal),
    })),
  };
};

/** Lookup by phone before creating a lead/contact (duplicate warning in the UI). */
export const lookupByMobile = async (access: CrmAccess, mobileValue: string) => {
  const mobile = normalizeMobile(mobileValue);
  if (!mobile) return { mobile: null, contact: null, openLeads: [] };
  const user = await prisma.user.findFirst({ where: { mobile: { in: mobileVariants(mobile) } }, select: { ...contactSelect } });
  if (!user) return { mobile, contact: null, openLeads: [] };
  const { terminal } = await listPipelineStageStatusSets();
  const openLeads = await prisma.lead.findMany({
    where: { AND: [{ customerId: user.id, status: { notIn: [...terminal] }, mergedIntoId: null }, leadScopeWhere(access)] },
    select: { id: true, status: true, leadType: true, createdAt: true, listingTitleSnapshot: true, owner: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return { mobile, contact: user, openLeads };
};

export const createContact = async (access: CrmAccess, body: Record<string, unknown>) => {
  if (access.isPartner) throw forbidden('Partners add contacts by creating a lead.');
  return prisma.$transaction(async (tx) => {
    const { user, created } = await findOrCreateContact(tx, body, access.userId);
    await applyProfilePatch(tx, access, user.id, body);
    if (created) {
      await tx.crmContactActivity.create({ data: { contactUserId: user.id, actorId: access.userId, type: 'CREATED', title: 'Contact created in CRM' } });
    }
    return { contact: user, created };
  });
};

const applyProfilePatch = async (db: Db, access: CrmAccess, userId: string, body: Record<string, unknown>) => {
  const data: Prisma.CrmContactProfileUncheckedUpdateInput = {};
  if ('companyName' in body) data.companyName = textOrNull(body.companyName, 160);
  if ('alternatePhone' in body) data.alternatePhone = optionalContactPhone(body.alternatePhone, 'alternate phone number');
  if ('address' in body) data.address = textOrNull(body.address, 500);
  if ('pinCode' in body) data.pinCode = textOrNull(body.pinCode, 6);
  if ('gstNumber' in body) data.gstNumber = textOrNull(body.gstNumber, 15)?.toUpperCase() ?? null;
  if ('source' in body) data.source = textOrNull(body.source, 40);
  if ('lifecycle' in body) {
    const lifecycle = oneOf(LIFECYCLES, body.lifecycle);
    if (lifecycle) data.lifecycle = lifecycle;
  }
  if ('contactTypes' in body) data.contactTypes = stringList(body.contactTypes, 10).map((item) => item.toUpperCase());
  if ('tags' in body) data.tags = stringList(body.tags);
  if ('notes' in body) data.notes = textOrNull(body.notes, 5000);
  if ('doNotContact' in body) data.doNotContact = Boolean(body.doNotContact);
  if ('preferredLanguage' in body) data.preferredLanguage = textOrNull(body.preferredLanguage, 20);
  if ('preferredChannel' in body) data.preferredChannel = textOrNull(body.preferredChannel, 20);
  if ('ownerId' in body) {
    const ownerId = textOrNull(body.ownerId, 60);
    if (ownerId && ownerId !== access.userId && !access.canAssign) throw forbidden('Only managers can change a contact owner.');
    data.ownerId = ownerId;
  }
  await db.crmContactProfile.upsert({
    where: { userId },
    create: { ...(data as Omit<Prisma.CrmContactProfileUncheckedCreateInput, 'userId'>), userId, createdById: access.userId },
    update: data,
  });
};

export const updateContact = async (access: CrmAccess, userId: string, body: Record<string, unknown>) => {
  if (access.isPartner) throw forbidden('Partners cannot edit CRM contacts.');
  if (!access.canManage) throw forbidden();
  await assertContactAccess(access, userId);
  return prisma.$transaction(async (tx) => {
    const userData: Prisma.UserUpdateInput = {};
    if ('name' in body && textOrNull(body.name, 120)) userData.name = textOrNull(body.name, 120);
    if ('email' in body) {
      const email = textOrNull(body.email, 160)?.toLowerCase() ?? null;
      if (email) {
        const existing = await tx.user.findFirst({ where: { email, id: { not: userId } }, select: { id: true } });
        if (existing) throw conflict('That email address is already in use.');
      }
      userData.email = email;
    }
    if ('city' in body) userData.city = textOrNull(body.city, 80);
    if ('state' in body) userData.state = textOrNull(body.state, 80);
    if ('whatsappNumber' in body) userData.whatsappNumber = optionalContactPhone(body.whatsappNumber, 'WhatsApp number');
    if (Object.keys(userData).length) await tx.user.update({ where: { id: userId }, data: userData });
    await applyProfilePatch(tx, access, userId, body);
    await tx.crmContactActivity.create({
      data: { contactUserId: userId, actorId: access.userId, type: 'PROFILE_UPDATE', title: 'Contact details updated', metadata: { fields: Object.keys(body).slice(0, 30) } },
    });
    return tx.user.findUnique({ where: { id: userId }, select: { ...contactSelect, crmProfile: true } });
  });
};

const CONTACT_ACTIVITY_TYPES = ['NOTE', 'CALL', 'WHATSAPP', 'SMS', 'EMAIL', 'VISIT', 'MEETING'];

export const addContactActivity = async (access: CrmAccess, userId: string, body: Record<string, unknown>) => {
  if (!access.canManage) throw forbidden();
  await assertContactAccess(access, userId);
  const type = String(body.type || 'NOTE').toUpperCase();
  if (!CONTACT_ACTIVITY_TYPES.includes(type)) throw badRequest('Unknown activity type.');
  const content = textOrNull(body.content, 5000);
  if (!content) throw badRequest('Write a note for this activity.');
  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata as Prisma.InputJsonValue : undefined;
  return prisma.crmContactActivity.create({
    data: { contactUserId: userId, actorId: access.userId, type, title: textOrNull(body.title, 200) || `${type.charAt(0)}${type.slice(1).toLowerCase()} logged`, content, ...(metadata ? { metadata } : {}) },
  });
};

/** Outstanding finance balances for parties sharing this phone (Finance Hub; optional). */
const financeSnapshot = async (mobile: string) => {
  try {
    const parties = await prisma.finParty.findMany({ where: { OR: [{ mobile: { in: mobileVariants(mobile) } }, { altMobile: { in: mobileVariants(mobile) } }] }, select: { id: true, name: true, code: true } });
    if (!parties.length) return { parties: [], receivable: 0, payable: 0 };
    const accounts = await prisma.finAccount.findMany({ where: { systemKey: { in: [...RECEIVABLE_KEYS, ...PAYABLE_KEYS] } }, select: { id: true, systemKey: true } });
    const receivableIds = new Set(accounts.filter((a) => (RECEIVABLE_KEYS as readonly string[]).includes(a.systemKey ?? '')).map((a) => a.id));
    const rows = await prisma.finVoucherLine.groupBy({
      by: ['accountId'],
      where: { partyId: { in: parties.map((p) => p.id) }, accountId: { in: accounts.map((a) => a.id) }, voucher: { status: { in: LEDGER_STATUSES } } },
      _sum: { debit: true, credit: true },
    });
    let receivable = 0;
    let payable = 0;
    for (const row of rows) {
      const net = Number(row._sum.debit ?? 0) - Number(row._sum.credit ?? 0);
      if (receivableIds.has(row.accountId)) receivable += net;
      else payable -= net;
    }
    return { parties, receivable: Math.round(receivable * 100) / 100, payable: Math.round(payable * 100) / 100 };
  } catch {
    return { parties: [], receivable: 0, payable: 0, unavailable: true };
  }
};

/** Everything known about one contact, filtered by what the viewer may see. */
export const getContact360 = async (access: CrmAccess, userId: string) => {
  await assertContactAccess(access, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...contactSelect, createdAt: true, crmProfile: { include: { owner: { select: { id: true, name: true } } } } },
  });
  if (!user) throw notFound('Contact not found.');
  const leadWhere: Prisma.LeadWhereInput = { AND: [{ customerId: userId }, leadScopeWhere(access)] };
  const [leads, followUps, activities] = await Promise.all([
    prisma.lead.findMany({
      where: leadWhere,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, status: true, leadType: true, source: true, priority: true, temperature: true, score: true, createdAt: true, closedAt: true,
        nextFollowUpAt: true, listingTitleSnapshot: true, expectedValue: true, wonAmount: true, mergedIntoId: true,
        owner: { select: { id: true, name: true } }, dealer: { select: { id: true, name: true, role: true } },
        pipelineStage: { select: { code: true, name: true, color: true, isTerminal: true } },
      },
    }),
    prisma.crmFollowUp.findMany({
      where: { contactUserId: userId, ...(access.canSeeAll ? {} : { lead: leadScopeWhere(access) }) },
      orderBy: { dueAt: 'desc' },
      take: 50,
      include: { owner: { select: { id: true, name: true } }, lead: { select: { id: true, status: true, leadType: true, priority: true, temperature: true, listingTitleSnapshot: true } } },
    }),
    access.isPartner ? Promise.resolve([]) : prisma.crmContactActivity.findMany({ where: { contactUserId: userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);

  const pipelineStage = selectContactPipelineStage(
    leads,
    leads.filter((lead) => lead.pipelineStage?.isTerminal).map((lead) => lead.status),
  );

  // Partners see their own leads and follow-ups only, not the platform's history with the customer.
  if (access.isPartner) {
    return { contact: { ...user, crmProfile: null }, leads, pipelineStage, followUps, activities: [], prime: null, payments: [], deals: [], rto: [], interest: null, finance: null };
  }

  const mobile = normalizeMobile(user.mobile);
  const phones = mobile ? mobileVariants(mobile) : [];
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const [prime, payments, deals, rto, events] = await Promise.all([
    prisma.customerPrimeSubscription.findMany({ where: { userId }, orderBy: { submittedAt: 'desc' }, take: 5, select: { id: true, status: true, startedAt: true, expiresAt: true, paidAmount: true } }),
    prisma.listingPaymentSubmission.findMany({ where: { buyerId: userId }, orderBy: { submittedAt: 'desc' }, take: 10, select: { id: true, status: true, amount: true, method: true, submittedAt: true, listing: { select: { id: true, title: true } } } }),
    phones.length
      ? prisma.sellAccount.findMany({
        where: { deletedAt: null, OR: [{ purchaserNumber: { in: phones } }, { sellerNumber: { in: phones } }, { ownerNumber: { in: phones } }] },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, recordNumber: true, listingTitle: true, vehicleNumber: true, sellAmount: true, purchaseAmount: true, dealStatus: true, purchaserNumber: true, sellerNumber: true, createdAt: true },
      })
      : Promise.resolve([]),
    phones.length
      ? prisma.vehicleRtoRecord.findMany({
        where: { OR: [{ customerNumber: { in: phones } }, { purchaserNumber: { in: phones } }, { sellerNumber: { in: phones } }] },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, vehicleNumber: true, rtoStatus: true, rtoOffice: true, createdAt: true },
      })
      : Promise.resolve([]),
    prisma.analyticsEvent.findMany({
      where: { actorUserId: userId, occurredAt: { gte: since }, eventType: { in: ['LISTING_VIEW', 'CONTACT_CLICK', 'SEARCH'] } },
      orderBy: { occurredAt: 'desc' },
      take: 300,
      select: { eventType: true, listingId: true, query: true, occurredAt: true },
    }),
  ]);
  const viewedIds = [...new Set(events.filter((e) => e.eventType === 'LISTING_VIEW' && e.listingId).map((e) => e.listingId as string))].slice(0, 10);
  const viewed = viewedIds.length
    ? await prisma.listing.findMany({ where: { id: { in: viewedIds } }, select: { id: true, title: true, price: true, status: true, locationCity: true } })
    : [];
  return {
    contact: user,
    leads,
    pipelineStage,
    followUps,
    activities,
    prime: { active: prime.some((p) => p.status === 'ACTIVE'), history: prime.map((p) => ({ ...p, paidAmount: toNumber(p.paidAmount) })) },
    payments: payments.map((p) => ({ ...p, amount: toNumber(p.amount) })),
    deals: deals.map((d) => ({ ...d, sellAmount: toNumber(d.sellAmount), purchaseAmount: toNumber(d.purchaseAmount), side: phones.includes(d.purchaserNumber ?? '') ? 'BUYER' : 'SELLER' })),
    rto,
    interest: {
      listingViews: events.filter((e) => e.eventType === 'LISTING_VIEW').length,
      contactClicks: events.filter((e) => e.eventType === 'CONTACT_CLICK').length,
      searches: events.filter((e) => e.eventType === 'SEARCH' && e.query).slice(0, 10).map((e) => ({ query: e.query, at: e.occurredAt })),
      viewedListings: viewedIds.map((id) => viewed.find((l) => l.id === id)).filter(Boolean).map((l) => ({ ...l!, price: toNumber(l!.price) })),
    },
    finance: mobile ? await financeSnapshot(mobile) : null,
  };
};
