import { FinPartyType, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, conflict, notFound } from '../http';
import {
  GST_STATE_CODES,
  isValidGstin,
  isValidIfsc,
  isValidPan,
  isValidPinCode,
  normalizeGstin,
  normalizeIdentifier,
  normalizeIndianMobile,
  panFromGstin,
  stateCodeForName,
} from '../utils/india';
import { readBoolean, readInt, readMoney, readMultiline, readString } from '../utils/input';
import { writeFinAudit } from './audit.service';
import { sequential, type ActorContext } from './context';

export const PARTY_TYPES = Object.values(FinPartyType);

export const maskAccountNumber = (value: string | null) =>
  value ? `${'X'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}` : null;

type PartyRecord = Prisma.FinPartyGetPayload<{ include: { links: true } }> | Prisma.FinPartyGetPayload<object>;

export const serializeParty = (party: PartyRecord, canSeeBankDetails: boolean) => ({
  ...party,
  creditLimit: party.creditLimit === null ? null : party.creditLimit.toNumber(),
  bankAccountNumber: canSeeBankDetails ? party.bankAccountNumber : maskAccountNumber(party.bankAccountNumber),
});

const readMobile = (body: Record<string, unknown>, key: string, label: string) => {
  if (body[key] === undefined || body[key] === null || body[key] === '') return null;
  const mobile = normalizeIndianMobile(body[key] as string);
  if (!mobile) throw badRequest(`${label} must be a valid 10-digit Indian mobile number.`);
  return mobile;
};

const readTypes = (value: unknown) => {
  if (!Array.isArray(value) || !value.length) throw badRequest('Choose at least one party type.');
  const types = Array.from(new Set(value.map(String)));
  if (types.some((type) => !(PARTY_TYPES as string[]).includes(type))) throw badRequest('Party type is invalid.');
  return types as FinPartyType[];
};

/** Validates a party form. GSTIN fills PAN and state when those are blank. */
export const buildPartyInput = (body: Record<string, unknown>) => {
  const gstinRaw = body.gstin ? normalizeGstin(body.gstin) : '';
  if (gstinRaw && !isValidGstin(gstinRaw)) throw badRequest('GSTIN is not valid. Check the 15 characters and the check digit.');
  const panRaw = body.pan ? normalizeIdentifier(body.pan) : gstinRaw ? panFromGstin(gstinRaw) : '';
  if (panRaw && !isValidPan(panRaw)) throw badRequest('PAN is not valid.');
  if (gstinRaw && panRaw && panFromGstin(gstinRaw) !== panRaw) throw badRequest('PAN does not match the PAN inside the GSTIN.');

  const stateFromGstin = gstinRaw ? GST_STATE_CODES[gstinRaw.slice(0, 2)] ?? null : null;
  const state = readString(body, 'state', 'State', { max: 80 }) ?? stateFromGstin;
  const stateCode = gstinRaw ? gstinRaw.slice(0, 2) : stateCodeForName(state);

  const ifsc = body.ifsc ? normalizeIdentifier(body.ifsc) : null;
  if (ifsc && !isValidIfsc(ifsc)) throw badRequest('IFSC is not valid.');
  const bankAccountNumber = body.bankAccountNumber ? String(body.bankAccountNumber).replace(/\s/g, '').toUpperCase() : null;
  if (bankAccountNumber && !/^[0-9A-Z]{6,34}$/.test(bankAccountNumber)) throw badRequest('Bank account number is not valid.');
  const pinCode = readString(body, 'pinCode', 'PIN code', { max: 6 });
  if (pinCode && !isValidPinCode(pinCode)) throw badRequest('PIN code must be 6 digits.');
  const email = readString(body, 'email', 'Email', { max: 160 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Email is not valid.');
  const upiId = readString(body, 'upiId', 'UPI ID', { max: 80 });
  if (upiId && !/^[\w.-]{2,}@[\w.-]{2,}$/.test(upiId)) throw badRequest('UPI ID is not valid.');

  return {
    name: readString(body, 'name', 'Party name', { max: 160, required: true })!,
    types: readTypes(body.types),
    mobile: readMobile(body, 'mobile', 'Mobile'),
    altMobile: readMobile(body, 'altMobile', 'Alternate mobile'),
    email,
    gstin: gstinRaw || null,
    pan: panRaw || null,
    address: readMultiline(body, 'address', 'Address', 500),
    city: readString(body, 'city', 'City', { max: 80 }),
    state,
    stateCode,
    pinCode,
    bankName: readString(body, 'bankName', 'Bank name', { max: 100 }),
    bankAccountNumber,
    ifsc,
    upiId,
    creditLimit: readMoney(body, 'creditLimit', 'Credit limit'),
    creditDays: readInt(body, 'creditDays', 'Credit days', { min: 0, max: 365 }),
    tdsSection: readString(body, 'tdsSection', 'TDS section', { max: 10 })?.toUpperCase() ?? null,
    isActive: readBoolean(body, 'isActive', true),
    notes: readMultiline(body, 'notes', 'Notes', 1000),
  };
};

const nextPartyCode = async (tx: Prisma.TransactionClient, offset = 0) => {
  const last = await tx.finParty.findFirst({ where: { code: { startsWith: 'P-' } }, orderBy: { code: 'desc' }, select: { code: true } });
  const current = last ? Number.parseInt(last.code.slice(2), 10) || 0 : 0;
  return (index: number) => `P-${String(current + offset + index + 1).padStart(6, '0')}`;
};

const findDuplicates = (tx: Prisma.TransactionClient, input: { mobile: string | null; gstin: string | null }, excludeId?: string) => {
  const or: Prisma.FinPartyWhereInput[] = [];
  if (input.mobile) or.push({ mobile: input.mobile });
  if (input.gstin) or.push({ gstin: input.gstin });
  if (!or.length) return Promise.resolve([]);
  return tx.finParty.findMany({
    where: { OR: or, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true, code: true, name: true, mobile: true, gstin: true },
    take: 5,
  });
};

export const listParties = async (query: Record<string, unknown>, canSeeBankDetails: boolean) => {
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
  const type = typeof query.type === 'string' && (PARTY_TYPES as string[]).includes(query.type) ? (query.type as FinPartyType) : null;
  const types = typeof query.types === 'string'
    ? query.types.split(',').filter((item): item is FinPartyType => (PARTY_TYPES as string[]).includes(item))
    : [];
  const status = query.status === 'inactive' ? false : query.status === 'all' ? null : true;
  const page = Math.max(Number.parseInt(String(query.page || '1'), 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(String(query.pageSize || '25'), 10) || 25, 1), 500);
  const digits = q.replace(/\D/g, '');

  const where: Prisma.FinPartyWhereInput = {
    ...(status === null ? {} : { isActive: status }),
    ...(type ? { types: { has: type } } : types.length ? { types: { hasSome: types } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
            { gstin: { contains: q.toUpperCase() } },
            { city: { contains: q, mode: 'insensitive' } },
            ...(digits.length >= 4 ? [{ mobile: { contains: digits } }] : []),
          ],
        }
      : {}),
  };

  const [parties, total] = await Promise.all([
    prisma.finParty.findMany({ where, orderBy: [{ name: 'asc' }], skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { links: true } } } }),
    prisma.finParty.count({ where }),
  ]);
  return { parties: parties.map((party) => serializeParty(party, canSeeBankDetails)), total, page, pageSize };
};

export const getParty = async (id: string, canSeeBankDetails: boolean) => {
  const party = await prisma.finParty.findUnique({ where: { id }, include: { links: { orderBy: { createdAt: 'asc' } } } });
  if (!party) throw notFound('Party not found.');
  return serializeParty(party, canSeeBankDetails);
};

export const createParty = async (body: Record<string, unknown>, context: ActorContext, canSeeBankDetails: boolean) => {
  const input = buildPartyInput(body);
  const force = body.force === true;
  return prisma.$transaction(async (tx) => {
    const duplicates = await findDuplicates(tx, input);
    if (duplicates.length && !force) {
      throw conflict('A party with the same mobile or GSTIN already exists. Open it, or save anyway.', { duplicates });
    }
    const code = (await nextPartyCode(tx))(0);
    const party = await tx.finParty.create({ data: { ...input, code, createdById: context.actorUserId } });
    await writeFinAudit({ ...context, entityType: 'FinParty', entityId: party.id, action: 'CREATE', after: { ...party, bankAccountNumber: maskAccountNumber(party.bankAccountNumber) } }, tx);
    return serializeParty(party, canSeeBankDetails);
  });
};

export const updateParty = async (id: string, body: Record<string, unknown>, context: ActorContext, canSeeBankDetails: boolean) =>
  prisma.$transaction(async (tx) => {
    const before = await tx.finParty.findUnique({ where: { id } });
    if (!before) throw notFound('Party not found.');
    // A masked account number coming back from the form means "unchanged".
    const patch: Record<string, unknown> = { ...body };
    if (typeof patch.bankAccountNumber === 'string' && patch.bankAccountNumber.includes('X')) delete patch.bankAccountNumber;
    delete patch.force;
    const touched = new Set(Object.keys(patch));
    if (touched.has('gstin')) ['pan', 'state', 'stateCode'].forEach((key) => touched.add(key));
    if (touched.has('state')) touched.add('stateCode');

    // Re-validate the merged record so a partial edit cannot leave PAN/GSTIN/state inconsistent;
    // fields derived from a changed GSTIN are recomputed unless the form sent them.
    const merged = buildPartyInput({
      ...before,
      creditLimit: before.creditLimit?.toString() ?? null,
      ...(touched.has('gstin') && patch.pan === undefined ? { pan: null } : {}),
      ...(touched.has('gstin') && patch.state === undefined ? { state: null } : {}),
      ...patch,
    });
    const data = Object.fromEntries(Object.entries(merged).filter(([key]) => touched.has(key))) as Partial<typeof merged>;
    if (body.force !== true && (data.mobile || data.gstin)) {
      const duplicates = await findDuplicates(tx, { mobile: data.mobile ?? null, gstin: data.gstin ?? null }, id);
      if (duplicates.length) throw conflict('Another party already has this mobile or GSTIN.', { duplicates });
    }
    const party = await tx.finParty.update({ where: { id }, data });
    await writeFinAudit({
      ...context,
      entityType: 'FinParty',
      entityId: id,
      action: 'UPDATE',
      before: { ...before, bankAccountNumber: maskAccountNumber(before.bankAccountNumber) },
      after: { ...party, bankAccountNumber: maskAccountNumber(party.bankAccountNumber) },
    }, tx);
    return serializeParty(party, canSeeBankDetails);
  });

// ---------------------------------------------------------------------------
// Sync from existing records (read-only on the source tables).
// ---------------------------------------------------------------------------

export type PartyCandidate = {
  linkType: string;
  linkId: string;
  type: FinPartyType;
  name: string;
  mobile: string | null;
  gstin: string | null;
  city: string | null;
  state: string | null;
};

type ExistingParty = { id: string; name: string; mobile: string | null; gstin: string | null; types: FinPartyType[] };

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Groups candidates into new parties or additions to existing ones. Match order: GSTIN, mobile,
 * then (only when the candidate has neither) the exact name. Name-only matches are reported so
 * someone can review them.
 */
export const planPartySync = (existing: ExistingParty[], linkedKeys: Set<string>, candidates: PartyCandidate[]) => {
  type NewParty = { key: string; name: string; mobile: string | null; gstin: string | null; city: string | null; state: string | null; types: Set<FinPartyType>; links: PartyCandidate[] };
  const created = new Map<string, NewParty>();
  const updates = new Map<string, { partyId: string; addTypes: Set<FinPartyType>; links: PartyCandidate[] }>();
  let alreadyLinked = 0;
  let nameOnlyMatches = 0;

  const byGstin = new Map(existing.filter((party) => party.gstin).map((party) => [party.gstin!, party]));
  const byMobile = new Map(existing.filter((party) => party.mobile).map((party) => [party.mobile!, party]));
  const byName = new Map(existing.filter((party) => !party.mobile && !party.gstin).map((party) => [nameKey(party.name), party]));

  for (const candidate of candidates) {
    if (linkedKeys.has(`${candidate.linkType}:${candidate.linkId}`)) {
      alreadyLinked += 1;
      continue;
    }
    const nameOnly = !candidate.gstin && !candidate.mobile;
    const match = (candidate.gstin && byGstin.get(candidate.gstin))
      || (candidate.mobile && byMobile.get(candidate.mobile))
      || (nameOnly ? byName.get(nameKey(candidate.name)) : undefined);

    if (match) {
      if (nameOnly) nameOnlyMatches += 1;
      const update = updates.get(match.id) || { partyId: match.id, addTypes: new Set<FinPartyType>(), links: [] };
      if (!match.types.includes(candidate.type)) update.addTypes.add(candidate.type);
      update.links.push(candidate);
      updates.set(match.id, update);
      continue;
    }

    // Within one sync batch a person can appear with a GSTIN on one record and only a mobile
    // on another, so look new parties up by every identifier they have collected so far.
    const lookupKeys = [
      ...(candidate.gstin ? [`g:${candidate.gstin}`] : []),
      ...(candidate.mobile ? [`m:${candidate.mobile}`] : []),
      ...(nameOnly ? [`n:${nameKey(candidate.name)}`] : []),
    ];
    const existingEntry = lookupKeys.map((key) => created.get(key)).find(Boolean);
    if (nameOnly && existingEntry) nameOnlyMatches += 1;
    const entry = existingEntry || {
      key: lookupKeys[0]!,
      name: candidate.name,
      mobile: candidate.mobile,
      gstin: candidate.gstin,
      city: candidate.city,
      state: candidate.state,
      types: new Set<FinPartyType>(),
      links: [],
    };
    entry.types.add(candidate.type);
    entry.links.push(candidate);
    entry.mobile = entry.mobile || candidate.mobile;
    entry.gstin = entry.gstin || candidate.gstin;
    entry.city = entry.city || candidate.city;
    entry.state = entry.state || candidate.state;
    for (const key of [
      ...(entry.gstin ? [`g:${entry.gstin}`] : []),
      ...(entry.mobile ? [`m:${entry.mobile}`] : []),
      ...lookupKeys,
    ]) created.set(key, entry);
  }

  return {
    create: Array.from(new Set(created.values())).map((entry) => ({ ...entry, types: Array.from(entry.types) })),
    update: Array.from(updates.values()).map((entry) => ({ ...entry, addTypes: Array.from(entry.addTypes) })),
    alreadyLinked,
    nameOnlyMatches,
  };
};

const cleanName = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim().slice(0, 160);

export const collectPartyCandidates = async (): Promise<PartyCandidate[]> => {
  const [partners, deals] = await Promise.all([
    prisma.partnerProfile.findMany({
      select: {
        id: true,
        businessName: true,
        ownerName: true,
        gstNumber: true,
        user: { select: { name: true, mobile: true, city: true, state: true } },
      },
    }),
    prisma.sellAccount.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        sourceType: true,
        sellerName: true,
        sellerNumber: true,
        sellerCity: true,
        sellerState: true,
        purchaserName: true,
        purchaserNumber: true,
        purchaserCity: true,
        purchaserState: true,
        brokerName: true,
        brokerNumber: true,
      },
    }),
  ]);

  const candidates: PartyCandidate[] = [];
  for (const partner of partners) {
    const name = cleanName(partner.businessName || partner.ownerName || partner.user?.name);
    const gstin = partner.gstNumber ? normalizeGstin(partner.gstNumber) : '';
    if (!name) continue;
    candidates.push({
      linkType: 'PARTNER_PROFILE',
      linkId: partner.id,
      type: 'PARTNER',
      name,
      mobile: normalizeIndianMobile(partner.user?.mobile ?? null),
      gstin: gstin && isValidGstin(gstin) ? gstin : null,
      city: partner.user?.city ?? null,
      state: partner.user?.state ?? null,
    });
  }

  for (const deal of deals) {
    const sellerName = cleanName(deal.sellerName);
    // JCB Exchange itself as the source is the company, not a party.
    if (sellerName && deal.sourceType !== 'JCB_EXCHANGE') {
      candidates.push({
        linkType: 'SELL_ACCOUNT_SELLER',
        linkId: deal.id,
        type: deal.sourceType === 'PARTNER' ? 'PARTNER' : deal.sourceType === 'AGENT' ? 'AGENT' : 'SELLER',
        name: sellerName,
        mobile: normalizeIndianMobile(deal.sellerNumber),
        gstin: null,
        city: deal.sellerCity,
        state: deal.sellerState,
      });
    }
    const purchaserName = cleanName(deal.purchaserName);
    if (purchaserName) {
      candidates.push({
        linkType: 'SELL_ACCOUNT_PURCHASER',
        linkId: deal.id,
        type: 'CUSTOMER',
        name: purchaserName,
        mobile: normalizeIndianMobile(deal.purchaserNumber),
        gstin: null,
        city: deal.purchaserCity,
        state: deal.purchaserState,
      });
    }
    const brokerName = cleanName(deal.brokerName);
    if (brokerName) {
      candidates.push({
        linkType: 'SELL_ACCOUNT_BROKER',
        linkId: deal.id,
        type: 'BROKER',
        name: brokerName,
        mobile: normalizeIndianMobile(deal.brokerNumber),
        gstin: null,
        city: null,
        state: null,
      });
    }
  }
  return candidates;
};

export const syncPartiesFromRecords = async (body: Record<string, unknown>, context: ActorContext) => {
  const apply = body.apply === true;
  const candidates = await collectPartyCandidates();

  return prisma.$transaction(async (tx) => {
    const [existing, links] = await sequential([
      tx.finParty.findMany({ select: { id: true, name: true, mobile: true, gstin: true, types: true } }),
      tx.finPartyLink.findMany({ select: { linkType: true, linkId: true } }),
    ]);
    const plan = planPartySync(existing, new Set(links.map((link) => `${link.linkType}:${link.linkId}`)), candidates);
    const summary = {
      apply,
      candidates: candidates.length,
      newParties: plan.create.length,
      updatedParties: plan.update.length,
      newLinks: plan.create.reduce((total, item) => total + item.links.length, 0) + plan.update.reduce((total, item) => total + item.links.length, 0),
      alreadyLinked: plan.alreadyLinked,
      nameOnlyMatches: plan.nameOnlyMatches,
      sample: plan.create.slice(0, 10).map((item) => ({ name: item.name, mobile: item.mobile, types: item.types, records: item.links.length })),
    };
    if (!apply) return summary;

    const codeFor = await nextPartyCode(tx);
    for (const [index, item] of plan.create.entries()) {
      const stateCode = item.gstin ? item.gstin.slice(0, 2) : stateCodeForName(item.state);
      await tx.finParty.create({
        data: {
          code: codeFor(index),
          name: item.name,
          types: item.types,
          mobile: item.mobile,
          gstin: item.gstin,
          pan: item.gstin ? panFromGstin(item.gstin) : null,
          city: item.city,
          state: item.state,
          stateCode,
          createdById: context.actorUserId,
          links: { create: item.links.map((link) => ({ linkType: link.linkType, linkId: link.linkId })) },
        },
      });
    }
    for (const item of plan.update) {
      const party = existing.find((entry) => entry.id === item.partyId)!;
      await tx.finParty.update({
        where: { id: item.partyId },
        data: {
          ...(item.addTypes.length ? { types: Array.from(new Set([...party.types, ...item.addTypes])) } : {}),
          links: { create: item.links.map((link) => ({ linkType: link.linkType, linkId: link.linkId })) },
        },
      });
    }
    await writeFinAudit({ ...context, entityType: 'FinParty', entityId: 'sync', action: 'SYNC_FROM_RECORDS', after: summary }, tx);
    return summary;
  }, { timeout: 60000 });
};

/**
 * Finds (or creates) the party for one source record during automatic posting, using the same
 * matching as the bulk sync: existing link, then GSTIN, then mobile, then exact name when the
 * record has neither. Source records are only read.
 */
export const resolvePartyForCandidate = async (tx: Prisma.TransactionClient, candidate: PartyCandidate) => {
  const link = await tx.finPartyLink.findUnique({ where: { linkType_linkId: { linkType: candidate.linkType, linkId: candidate.linkId } } });
  if (link) return link.partyId;

  const match = (candidate.gstin && await tx.finParty.findFirst({ where: { gstin: candidate.gstin }, orderBy: { createdAt: 'asc' } }))
    || (candidate.mobile && await tx.finParty.findFirst({ where: { mobile: candidate.mobile }, orderBy: { createdAt: 'asc' } }))
    || (!candidate.gstin && !candidate.mobile
      ? await tx.finParty.findFirst({ where: { name: { equals: candidate.name, mode: 'insensitive' }, mobile: null, gstin: null }, orderBy: { createdAt: 'asc' } })
      : null);

  if (match) {
    await tx.finParty.update({
      where: { id: match.id },
      data: {
        ...(match.types.includes(candidate.type) ? {} : { types: [...match.types, candidate.type] }),
        links: { create: { linkType: candidate.linkType, linkId: candidate.linkId } },
      },
    });
    return match.id;
  }

  const code = (await nextPartyCode(tx))(0);
  const party = await tx.finParty.create({
    data: {
      code,
      name: candidate.name,
      types: [candidate.type],
      mobile: candidate.mobile,
      gstin: candidate.gstin,
      pan: candidate.gstin ? panFromGstin(candidate.gstin) : null,
      city: candidate.city,
      state: candidate.state,
      stateCode: candidate.gstin ? candidate.gstin.slice(0, 2) : stateCodeForName(candidate.state),
      links: { create: { linkType: candidate.linkType, linkId: candidate.linkId } },
    },
  });
  return party.id;
};
