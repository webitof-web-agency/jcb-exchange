import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

// One vehicle may appear on many listings over its life (sold, then brought back for resale), so the
// registration and chassis keys are not unique in the database. Instead a vehicle may have only one
// listing at a time that is under review, on the market or hidden by moderation. A DRAFT blocks only its own owner, so nobody
// can hold a vehicle number by saving a draft. SOLD and REJECTED listings never block; a sold one marks
// the next listing as a resale, which only admins see.

export type VehicleIdentityField = 'registration' | 'chassis';
export type VehicleIdentityState = 'EMPTY' | 'UNIQUE' | 'ALREADY_LISTED' | 'OWN_DRAFT' | 'PREVIOUSLY_SOLD';

// Hidden listings still hold the vehicle: an unlisted one can be relisted, a suspended one is being
// sorted out, and a blocked one keeps the vehicle off the platform.
export const BLOCKING_LISTING_STATUSES = ['PENDING_APPROVAL', 'CHANGES_REQUESTED', 'PUBLISHED', 'PAUSED', 'RESERVED', 'UNLISTED', 'SUSPENDED', 'BLOCKED'];
const BLOCKING_STATUS_SET = new Set(BLOCKING_LISTING_STATUSES);

const MIN_KEY_LENGTH = 5;
const PLACEHOLDER_KEYS = new Set([
  'NOTAVAILABLE',
  'NOTAPPLICABLE',
  'UNREGISTERED',
  'NOTREGISTERED',
  'APPLIEDFOR',
  'PENDING',
  'UNKNOWN',
]);

/** Upper-case A-Z0-9 form of a registration or chassis number, or null when it cannot identify a vehicle. */
export const toVehicleIdentityKey = (value: unknown): string | null => {
  const raw = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  // Providers mask chassis numbers with '*'; a masked value would match the wrong vehicle.
  if (raw.includes('*')) return null;
  const key = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (key.length < MIN_KEY_LENGTH || PLACEHOLDER_KEYS.has(key)) return null;
  return key;
};

const firstKey = (candidates: unknown[]) => {
  for (const candidate of candidates) {
    const key = toVehicleIdentityKey(candidate);
    if (key) return key;
  }
  return null;
};

/** Candidates are tried in order, so pass the seller's own entry before provider or legacy values. */
export const resolveListingVehicleKeys = (input: { registration: unknown[]; chassis: unknown[] }) => ({
  registrationNumberKey: firstKey(input.registration),
  chassisNumberKey: firstKey(input.chassis),
});

// The listing forms write these lines into the description; older listings only have them there.
export const parseListingDescriptionChassis = (description: string) => {
  const match = description.match(/(?:^|\n)chassis(?:\s*\/\s*|\s+or\s+|\s+)serial\s*:\s*([^\n]+)/i);
  return match?.[1]?.trim() || '';
};

export const parseListingDescriptionRegistration = (description: string) => {
  const match = description.match(/(?:^|\n)registration\s+no\s*:\s*([^\n]+)/i);
  return match?.[1]?.trim() || '';
};

export const isBlockingListingStatus = (status: unknown) => BLOCKING_STATUS_SET.has(String(status || '').toUpperCase());

/** Statuses a listing can be saved into that must pass the duplicate check. */
export const needsVehicleIdentityCheck = (status: unknown) =>
  isBlockingListingStatus(status) || String(status || '').toUpperCase() === 'DRAFT';

const phoneKey = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
};

// ---------------------------------------------------------------------------------------------
// Finding the other records of a vehicle
// ---------------------------------------------------------------------------------------------

type Db = Prisma.TransactionClient | typeof prisma;
type KeyPair = { registrationNumberKey: string | null; chassisNumberKey: string | null };

export type VehicleSale = {
  soldAt: Date | null;
  buyerName: string | null;
  buyerPhone: string | null;
  listingId: string | null;
  recordNumber: string | null;
};

export type VehicleListingMatch = {
  listingId: string;
  title: string;
  status: string;
  partnerId: string;
  partnerName: string | null;
  createdAt: Date;
  keys: KeyPair;
  matchedOn: VehicleIdentityField[];
  sale: VehicleSale | null;
};

export type VehicleSoldRecordMatch = {
  sellAccountId: string;
  listingId: string | null;
  keys: KeyPair;
  matchedOn: VehicleIdentityField[];
  sale: VehicleSale;
};

export type VehicleIdentityMatches = {
  listings: VehicleListingMatch[];
  soldRecords: VehicleSoldRecordMatch[];
};

const matchedFields = (row: KeyPair, keys: { registration: Set<string>; chassis: Set<string> }) => {
  const fields: VehicleIdentityField[] = [];
  if (row.registrationNumberKey && keys.registration.has(row.registrationNumberKey)) fields.push('registration');
  if (row.chassisNumberKey && keys.chassis.has(row.chassisNumberKey)) fields.push('chassis');
  return fields;
};

const listingSelect = {
  id: true,
  title: true,
  status: true,
  partnerId: true,
  createdAt: true,
  soldAt: true,
  registrationNumberKey: true,
  chassisNumberKey: true,
  partner: { select: { name: true, partnerProfile: { select: { businessName: true } } } },
  saleRecord: { select: { buyerName: true, buyerPhone: true, soldAt: true } },
  sellAccount: {
    select: { recordNumber: true, purchaserName: true, purchaserNumber: true, sellDate: true, cancelledAt: true, deletedAt: true, isDraft: true },
  },
} as const;

const saleFromListing = (row: any): VehicleSale | null => {
  if (String(row.status || '').toUpperCase() !== 'SOLD') return null;
  const account = row.sellAccount && !row.sellAccount.cancelledAt && !row.sellAccount.deletedAt && !row.sellAccount.isDraft
    ? row.sellAccount
    : null;
  return {
    soldAt: account?.sellDate || row.saleRecord?.soldAt || row.soldAt || null,
    buyerName: account?.purchaserName || row.saleRecord?.buyerName || null,
    buyerPhone: account?.purchaserNumber || row.saleRecord?.buyerPhone || null,
    listingId: row.id,
    recordNumber: account?.recordNumber || null,
  };
};

/** All listings and completed Sold Vehicle records that share any of the given keys. */
export const findVehicleIdentityMatches = async (
  db: Db,
  input: { registrationKeys: string[]; chassisKeys: string[]; excludeListingIds?: string[] },
): Promise<VehicleIdentityMatches> => {
  const keys = { registration: new Set(input.registrationKeys.filter(Boolean)), chassis: new Set(input.chassisKeys.filter(Boolean)) };
  if (!keys.registration.size && !keys.chassis.size) return { listings: [], soldRecords: [] };
  const exclude = new Set((input.excludeListingIds || []).filter(Boolean));
  const registrationKeys = Array.from(keys.registration);
  const chassisKeys = Array.from(keys.chassis);

  const or: Record<string, unknown>[] = [];
  if (registrationKeys.length) or.push({ registrationNumberKey: { in: registrationKeys } });
  if (chassisKeys.length) or.push({ chassisNumberKey: { in: chassisKeys } });

  const [listingRows, saleIds] = await Promise.all([
    (db as any).listing.findMany({ where: { OR: or }, select: listingSelect, orderBy: { createdAt: 'desc' }, take: 200 }),
    // Sold Vehicle records keep the numbers as typed, so they are normalized the same way here.
    db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "SellAccount"
      WHERE "deletedAt" IS NULL AND "cancelledAt" IS NULL AND "isDraft" = false
        AND (
          upper(regexp_replace(coalesce("vehicleNumber", ''), '[^A-Za-z0-9]', '', 'g')) = ANY(${registrationKeys}::text[])
          OR upper(regexp_replace(coalesce("chassisNumber", ''), '[^A-Za-z0-9]', '', 'g')) = ANY(${chassisKeys}::text[])
        )`,
  ]);

  const saleRows = saleIds.length
    ? await db.sellAccount.findMany({
      where: { id: { in: saleIds.map((row) => row.id) } },
      select: { id: true, listingId: true, recordNumber: true, vehicleNumber: true, chassisNumber: true, sellDate: true, createdAt: true, purchaserName: true, purchaserNumber: true },
    })
    : [];

  return {
    listings: (listingRows as any[])
      .filter((row) => !exclude.has(row.id))
      .map((row) => ({
        listingId: row.id,
        title: row.title,
        status: String(row.status),
        partnerId: row.partnerId,
        partnerName: row.partner?.partnerProfile?.businessName || row.partner?.name || null,
        createdAt: row.createdAt,
        keys: { registrationNumberKey: row.registrationNumberKey, chassisNumberKey: row.chassisNumberKey },
        matchedOn: matchedFields(row, keys),
        sale: saleFromListing(row),
      })),
    soldRecords: saleRows
      .filter((row) => !row.listingId || !exclude.has(row.listingId))
      .map((row) => {
        const recordKeys = {
          registrationNumberKey: toVehicleIdentityKey(row.vehicleNumber),
          chassisNumberKey: toVehicleIdentityKey(row.chassisNumber),
        };
        return {
        sellAccountId: row.id,
        listingId: row.listingId,
        keys: recordKeys,
        matchedOn: matchedFields(recordKeys, keys),
        sale: {
          soldAt: row.sellDate || row.createdAt,
          buyerName: row.purchaserName,
          buyerPhone: row.purchaserNumber,
          listingId: row.listingId,
          recordNumber: row.recordNumber,
        },
        };
      }),
  };
};

// ---------------------------------------------------------------------------------------------
// Deciding what the matches mean for one listing
// ---------------------------------------------------------------------------------------------

export type VehicleIdentityFieldResult = {
  key: string | null;
  state: VehicleIdentityState;
  listing: VehicleListingMatch | null;
};

export type VehicleIdentityAssessment = {
  registration: VehicleIdentityFieldResult;
  chassis: VehicleIdentityFieldResult;
  blocked: boolean;
  blockingField: VehicleIdentityField | null;
  blockingListing: VehicleListingMatch | null;
  /** Other sellers' drafts for the same vehicle; they do not block, admins are warned. */
  otherDrafts: VehicleListingMatch[];
  /** Other open listings, which only happens for listings saved before the check existed. */
  activeDuplicates: VehicleListingMatch[];
  lastSale: VehicleSale | null;
  isResale: boolean;
  /** Whether the new seller is the buyer of the last recorded sale; null when either phone is unknown. */
  sellerIsLastBuyer: boolean | null;
};

const latestSale = (sales: VehicleSale[]) =>
  sales.reduce<VehicleSale | null>((latest, sale) => {
    if (!latest) return sale;
    return (sale.soldAt?.getTime() || 0) > (latest.soldAt?.getTime() || 0) ? sale : latest;
  }, null);

export const assessVehicleIdentity = (input: {
  registrationKey: string | null;
  chassisKey: string | null;
  /** The user the listing belongs to; their own drafts block, other people's do not. */
  ownerUserId: string | null;
  sellerPhone?: string | null | undefined;
  /** Sales after this moment are not "previous" sales (used when assessing an existing listing). */
  saleCutoff?: Date | null;
  matches: VehicleIdentityMatches;
}): VehicleIdentityAssessment => {
  const { matches } = input;
  const cutoff = input.saleCutoff?.getTime() ?? Number.POSITIVE_INFINITY;
  const sales = [
    ...matches.listings.map((item) => item.sale).filter((sale): sale is VehicleSale => Boolean(sale)),
    ...matches.soldRecords
      // A Sold Vehicle record linked to a matching sold listing is the same sale.
      .filter((record) => !record.listingId || !matches.listings.some((item) => item.listingId === record.listingId && item.sale))
      .map((record) => record.sale),
  ].filter((sale) => (sale.soldAt?.getTime() || 0) <= cutoff);

  const assessField = (field: VehicleIdentityField, key: string | null): VehicleIdentityFieldResult => {
    if (!key) return { key, state: 'EMPTY', listing: null };
    const onField = matches.listings.filter((item) => item.matchedOn.includes(field));
    const listed = onField.find((item) => isBlockingListingStatus(item.status));
    if (listed) return { key, state: 'ALREADY_LISTED', listing: listed };
    const ownDraft = onField.find((item) => item.status === 'DRAFT' && input.ownerUserId && item.partnerId === input.ownerUserId);
    if (ownDraft) return { key, state: 'OWN_DRAFT', listing: ownDraft };
    const soldBefore = onField.some((item) => item.sale && sales.includes(item.sale))
      || matches.soldRecords.some((record) => record.matchedOn.includes(field) && sales.includes(record.sale));
    return { key, state: soldBefore ? 'PREVIOUSLY_SOLD' : 'UNIQUE', listing: null };
  };

  const registration = assessField('registration', input.registrationKey);
  const chassis = assessField('chassis', input.chassisKey);
  const blockingField = (['ALREADY_LISTED', 'OWN_DRAFT'] as VehicleIdentityState[]).includes(registration.state)
    ? 'registration'
    : (['ALREADY_LISTED', 'OWN_DRAFT'] as VehicleIdentityState[]).includes(chassis.state) ? 'chassis' : null;
  const lastSale = latestSale(sales);
  const sellerPhone = phoneKey(input.sellerPhone);
  const buyerPhone = phoneKey(lastSale?.buyerPhone);

  return {
    registration,
    chassis,
    blocked: Boolean(blockingField),
    blockingField,
    blockingListing: blockingField ? (blockingField === 'registration' ? registration.listing : chassis.listing) : null,
    otherDrafts: matches.listings.filter((item) => item.status === 'DRAFT' && item.partnerId !== input.ownerUserId),
    activeDuplicates: matches.listings.filter((item) => isBlockingListingStatus(item.status)),
    lastSale,
    isResale: Boolean(lastSale),
    sellerIsLastBuyer: lastSale && sellerPhone && buyerPhone ? sellerPhone === buyerPhone : null,
  };
};

const FIELD_LABEL: Record<VehicleIdentityField, string> = { registration: 'vehicle number', chassis: 'chassis number' };

export const describeVehicleIdentityBlock = (
  field: VehicleIdentityField,
  result: VehicleIdentityFieldResult,
  viewerUserId: string | null,
) => {
  const label = FIELD_LABEL[field];
  if (result.state === 'ALREADY_LISTED' && result.listing?.status === 'BLOCKED') {
    return `A vehicle with this ${label} is blocked on JCB Exchange. Contact support if you think this is a mistake.`;
  }
  if (result.state === 'OWN_DRAFT') return `You already have a saved draft with this ${label}. Open that draft to continue.`;
  if (result.state !== 'ALREADY_LISTED') return null;
  if (viewerUserId && result.listing?.partnerId === viewerUserId) return `You already have a listing with this ${label}.`;
  return `A vehicle with this ${label} is already listed on JCB Exchange.`;
};

// ---------------------------------------------------------------------------------------------
// Saving: the check that runs on create, update and status changes
// ---------------------------------------------------------------------------------------------

export class VehicleAlreadyListedError extends Error {
  readonly statusCode = 409;
  readonly code = 'vehicle_already_listed';

  constructor(message: string, readonly field: VehicleIdentityField, readonly listingId: string | null) {
    super(message);
    this.name = 'VehicleAlreadyListedError';
  }
}

/** Serializes concurrent saves of the same vehicle until the surrounding transaction ends. */
export const lockVehicleIdentityKeys = async (tx: Prisma.TransactionClient, keys: KeyPair) => {
  const lockKeys = [
    keys.registrationNumberKey ? `listing-vehicle:R:${keys.registrationNumberKey}` : '',
    keys.chassisNumberKey ? `listing-vehicle:C:${keys.chassisNumberKey}` : '',
  ].filter(Boolean).sort();
  for (const lockKey of lockKeys) {
    // pg_advisory_xact_lock returns void, which Prisma cannot read, so it is wrapped in a subquery.
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${lockKey}))) AS vehicle_lock`;
  }
};

export const assertVehicleIdentityAvailable = async (
  db: Db,
  input: KeyPair & { excludeListingId?: string | null; ownerUserId: string | null; viewerUserId: string | null },
) => {
  if (!input.registrationNumberKey && !input.chassisNumberKey) return;
  const matches = await findVehicleIdentityMatches(db, {
    registrationKeys: input.registrationNumberKey ? [input.registrationNumberKey] : [],
    chassisKeys: input.chassisNumberKey ? [input.chassisNumberKey] : [],
    excludeListingIds: input.excludeListingId ? [input.excludeListingId] : [],
  });
  const assessment = assessVehicleIdentity({
    registrationKey: input.registrationNumberKey,
    chassisKey: input.chassisNumberKey,
    ownerUserId: input.ownerUserId,
    matches,
  });
  if (!assessment.blocked || !assessment.blockingField) return;
  const field = assessment.blockingField;
  const message = describeVehicleIdentityBlock(field, assessment[field], input.viewerUserId)
    || 'This vehicle is already listed on JCB Exchange.';
  const ownListingId = assessment.blockingListing && assessment.blockingListing.partnerId === input.viewerUserId
    ? assessment.blockingListing.listingId
    : null;
  throw new VehicleAlreadyListedError(message, field, ownListingId);
};

/**
 * Status-only changes (approve, pause/resume, admin status). A listing moving onto the market, or being
 * published, must not sit beside another open listing of the same vehicle. Drafts never block here.
 */
export const assertListingStatusChangeAllowed = async (
  db: Db,
  listing: KeyPair & { id: string; status: unknown },
  nextStatus: unknown,
  viewerUserId: string | null,
) => {
  const next = String(nextStatus || '').toUpperCase();
  const previous = String(listing.status || '').toUpperCase();
  if (!isBlockingListingStatus(next)) return;
  if (isBlockingListingStatus(previous) && !(next === 'PUBLISHED' && previous !== 'PUBLISHED')) return;
  await assertVehicleIdentityAvailable(db, {
    registrationNumberKey: listing.registrationNumberKey || null,
    chassisNumberKey: listing.chassisNumberKey || null,
    excludeListingId: listing.id,
    ownerUserId: null,
    viewerUserId,
  });
};

export const vehicleAlreadyListedResponse =(error: VehicleAlreadyListedError) => ({
  error: error.message,
  code: error.code,
  field: error.field,
  ...(error.listingId ? { listingId: error.listingId } : {}),
});

// ---------------------------------------------------------------------------------------------
// Responses: what each kind of viewer is told
// ---------------------------------------------------------------------------------------------

/** Sellers learn only whether the number is free; resale history and other sellers stay hidden. */
export const serializeVehicleIdentityForSeller = (assessment: VehicleIdentityAssessment, viewerUserId: string) => {
  const field = (name: VehicleIdentityField) => {
    const result = assessment[name];
    const state = result.state === 'PREVIOUSLY_SOLD' ? 'UNIQUE' : result.state;
    const ownListingId = result.listing && result.listing.partnerId === viewerUserId ? result.listing.listingId : null;
    return {
      state,
      message: describeVehicleIdentityBlock(name, result, viewerUserId),
      ...(ownListingId ? { listingId: ownListingId, listingStatus: result.listing?.status } : {}),
    };
  };
  return { blocked: assessment.blocked, registration: field('registration'), chassis: field('chassis') };
};

const serializeSale = (sale: VehicleSale | null) => sale && ({
  soldAt: sale.soldAt,
  buyerName: sale.buyerName,
  buyerPhone: sale.buyerPhone,
  listingId: sale.listingId,
  recordNumber: sale.recordNumber,
});

const serializeMatch = (item: VehicleListingMatch) => ({
  listingId: item.listingId,
  title: item.title,
  status: item.status,
  seller: item.partnerName,
  createdAt: item.createdAt,
  matchedOn: item.matchedOn,
});

export const serializeVehicleIdentityForAdmin = (assessment: VehicleIdentityAssessment, viewerUserId: string | null) => {
  const field = (name: VehicleIdentityField) => ({
    state: assessment[name].state,
    message: describeVehicleIdentityBlock(name, assessment[name], viewerUserId),
    listing: assessment[name].listing ? serializeMatch(assessment[name].listing!) : null,
  });
  return {
    blocked: assessment.blocked,
    registration: field('registration'),
    chassis: field('chassis'),
    isResale: assessment.isResale,
    lastSale: serializeSale(assessment.lastSale),
    sellerIsLastBuyer: assessment.sellerIsLastBuyer,
    activeDuplicates: assessment.activeDuplicates.map(serializeMatch),
    otherDrafts: assessment.otherDrafts.map(serializeMatch),
  };
};

export type AdminVehicleIdentitySummary = ReturnType<typeof serializeVehicleIdentityForAdmin>;

/**
 * Admin-only resale/duplicate summary for listings already saved, in one round of queries.
 * A sale counts as "previous" only when it happened before the listing was created.
 */
export const buildAdminVehicleIdentitySummaries = async (
  db: Db,
  listings: Array<KeyPair & { id: string; partnerId: string; createdAt: Date; sellerPhone?: string | null | undefined }>,
  viewerUserId: string | null,
) => {
  const summaries = new Map<string, AdminVehicleIdentitySummary>();
  const keyed = listings.filter((item) => item.registrationNumberKey || item.chassisNumberKey);
  if (!keyed.length) return summaries;
  const matches = await findVehicleIdentityMatches(db, {
    registrationKeys: keyed.map((item) => item.registrationNumberKey).filter((key): key is string => Boolean(key)),
    chassisKeys: keyed.map((item) => item.chassisNumberKey).filter((key): key is string => Boolean(key)),
  });

  for (const item of keyed) {
    const itemKeys = {
      registration: new Set(item.registrationNumberKey ? [item.registrationNumberKey] : []),
      chassis: new Set(item.chassisNumberKey ? [item.chassisNumberKey] : []),
    };
    // The batch matched every listing's keys; narrow each row back to the ones shared with this listing.
    const narrow = <T extends { keys: KeyPair; matchedOn: VehicleIdentityField[] }>(rows: T[]) => rows
      .map((row) => ({ ...row, matchedOn: matchedFields(row.keys, itemKeys) }))
      .filter((row) => row.matchedOn.length);
    const assessment = assessVehicleIdentity({
      registrationKey: item.registrationNumberKey,
      chassisKey: item.chassisNumberKey,
      ownerUserId: item.partnerId,
      sellerPhone: item.sellerPhone,
      saleCutoff: item.createdAt,
      matches: {
        listings: narrow(matches.listings.filter((row) => row.listingId !== item.id)),
        soldRecords: narrow(matches.soldRecords.filter((row) => row.listingId !== item.id)),
      },
    });
    summaries.set(item.id, serializeVehicleIdentityForAdmin(assessment, viewerUserId));
  }
  return summaries;
};
