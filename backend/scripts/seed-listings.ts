import fs from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import prismaModule from '../src/lib/prisma';

const prisma = ((prismaModule as any).default ?? prismaModule) as any;
const seedFilePath = path.join(process.cwd(), 'scripts', 'listing-seed-data.json');

type ListingSeedFile = {
  defaults?: {
    approveAndPublishAfterCreate?: boolean;
  };
  listings: ListingSeed[];
};

type ListingSeed = {
  seedKey: string;
  sellerRef: string;
  primeLeadCustomerRef?: string | null;
  formData: {
    categoryName: string;
    brandName: string;
    modelName: string;
    title: string;
    variant?: string;
    manufacturingYear: number;
    registrationYear?: string;
    registrationNo?: string;
    chassisOrSerialNo?: string;
    previousOwners?: string;
    condition?: string;
    operatingHours?: number;
    fuelType?: string;
    transmission?: string;
    currentAvailability?: string;
    price: number;
    isNegotiable?: boolean;
    stateName: string;
    district?: string;
    cityName: string;
    pinCode?: string;
    nearbyLandmark?: string;
    description?: string;
    additionalDescription?: string;
    grossPower?: string;
    insuranceExpiry?: string;
  };
  media: Array<{
    slot: string;
    kind: 'image' | 'video';
    isFeatured?: boolean;
    uploadedFileUrl?: string;
    sourceUrl?: string;
  }>;
  publishFlow?: {
    autoPublishAfterCreate?: boolean;
  };
  resolvedIds?: {
    sellerUserId?: string | null;
    categoryId?: string | null;
    brandId?: string | null;
    modelId?: string | null;
  };
};

const normalizeText = (value: unknown) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const buildDescription = (listing: ListingSeed) => {
  const form = listing.formData;
  const detailLines = [
    form.variant ? `Variant: ${form.variant}` : '',
    form.registrationYear ? `Registration year: ${form.registrationYear}` : '',
    form.registrationNo ? `Registration no: ${form.registrationNo}` : '',
    form.chassisOrSerialNo ? `Chassis or serial: ${form.chassisOrSerialNo}` : '',
    form.previousOwners ? `Owners: ${form.previousOwners}` : '',
    form.fuelType ? `Fuel: ${form.fuelType}` : '',
    form.transmission ? `Transmission: ${form.transmission}` : '',
    form.district ? `District: ${form.district}` : '',
    form.pinCode ? `Pin code: ${form.pinCode}` : '',
    form.nearbyLandmark ? `Landmark: ${form.nearbyLandmark}` : '',
    form.insuranceExpiry ? `Insurance expiry: ${form.insuranceExpiry}` : '',
  ].filter(Boolean);

  return [normalizeText(form.description), ...detailLines].filter(Boolean).join('\n');
};

const buildListingStatus = (seedFile: ListingSeedFile, listing: ListingSeed) => {
  const shouldPublish =
    listing.publishFlow?.autoPublishAfterCreate ??
    seedFile.defaults?.approveAndPublishAfterCreate ??
    true;

  return shouldPublish ? 'PUBLISHED' : 'PENDING_APPROVAL';
};

const buildMediaRows = (listing: ListingSeed) =>
  listing.media
    .map((item) => {
      const url = normalizeText(item.uploadedFileUrl) || normalizeText(item.sourceUrl);
      if (!url) {
        return null;
      }

      return {
        url,
        type: item.kind.toUpperCase(),
        slot: normalizeText(item.slot).toLowerCase() || null,
        isFeatured: Boolean(item.isFeatured) || normalizeText(item.slot).toLowerCase() === 'front-view',
      };
    })
    .filter(
      (
        item
      ): item is {
        url: string;
        type: string;
        slot: string | null;
        isFeatured: boolean;
      } => item !== null
    );

const loadSeedFile = (): ListingSeedFile => {
  const raw = fs.readFileSync(seedFilePath, 'utf8');
  return JSON.parse(raw) as ListingSeedFile;
};

const shouldResetBeforeSeed = process.argv.includes('--reset');

const assertRequiredIds = (listing: ListingSeed) => {
  const sellerUserId = listing.resolvedIds?.sellerUserId;
  const categoryId = listing.resolvedIds?.categoryId;
  const brandId = listing.resolvedIds?.brandId;
  const modelId = listing.resolvedIds?.modelId;

  if (!sellerUserId || !categoryId || !brandId || !modelId) {
    throw new Error(`Missing resolved ids for seed ${listing.seedKey}`);
  }

  return { sellerUserId, categoryId, brandId, modelId };
};

const findExistingSeedListingIds = async (listing: ListingSeed) => {
  const { sellerUserId, categoryId, brandId, modelId } = assertRequiredIds(listing);
  const form = listing.formData;
  const existing = await prisma.listing.findMany({
    where: {
      partnerId: sellerUserId,
      categoryId,
      brandId,
      modelId,
      title: form.title,
      manufacturingYear: form.manufacturingYear,
      locationState: form.stateName,
      locationCity: form.cityName,
    },
    select: { id: true },
  });

  return existing.map((row: { id: string }) => row.id);
};

const resetExistingSeedListings = async (seedFile: ListingSeedFile) => {
  const idSet = new Set<string>();

  for (const listing of seedFile.listings) {
    const ids = await findExistingSeedListingIds(listing);
    ids.forEach((id: string) => idSet.add(id));
  }

  const listingIds = Array.from(idSet);
  if (!listingIds.length) {
    return { deletedListings: 0, deletedMedia: 0 };
  }

  const deletedMedia = await prisma.media.deleteMany({
    where: { listingId: { in: listingIds } },
  });

  const deletedListings = await prisma.listing.deleteMany({
    where: { id: { in: listingIds } },
  });

  return {
    deletedListings: deletedListings.count,
    deletedMedia: deletedMedia.count,
  };
};

const upsertListing = async (seedFile: ListingSeedFile, listing: ListingSeed) => {
  const { sellerUserId, categoryId, brandId, modelId } = assertRequiredIds(listing);
  const description = buildDescription(listing);
  const mediaRows = buildMediaRows(listing);
  const status = buildListingStatus(seedFile, listing);
  const form = listing.formData;

  const existing = await prisma.listing.findFirst({
    where: {
      partnerId: sellerUserId,
      categoryId,
      brandId,
      modelId,
      title: form.title,
      manufacturingYear: form.manufacturingYear,
      locationState: form.stateName,
      locationCity: form.cityName,
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.$transaction(async (tx: any) => {
      await tx.media.deleteMany({
        where: { listingId: existing.id },
      });

      await tx.listing.update({
        where: { id: existing.id },
        data: {
          partnerId: sellerUserId,
          categoryId,
          brandId,
          modelId,
          title: form.title,
          price: new Prisma.Decimal(form.price),
          isNegotiable: Boolean(form.isNegotiable),
          manufacturingYear: form.manufacturingYear,
          operatingHours: form.operatingHours ?? null,
          locationState: form.stateName,
          locationCity: form.cityName,
          condition: normalizeText(form.condition) || null,
          description: description || null,
          additionalDescription: normalizeText(form.additionalDescription) || null,
          grossPower: normalizeText(form.grossPower) || null,
          status,
          soldAt: null,
          media: mediaRows.length ? { create: mediaRows } : undefined,
        },
      });
    });

    return { action: 'updated', seedKey: listing.seedKey, listingId: existing.id, status };
  }

  const created = await prisma.listing.create({
    data: {
      partnerId: sellerUserId,
      categoryId,
      brandId,
      modelId,
      title: form.title,
      price: new Prisma.Decimal(form.price),
      isNegotiable: Boolean(form.isNegotiable),
      manufacturingYear: form.manufacturingYear,
      operatingHours: form.operatingHours ?? null,
      locationState: form.stateName,
      locationCity: form.cityName,
      condition: normalizeText(form.condition) || null,
      description: description || null,
      additionalDescription: normalizeText(form.additionalDescription) || null,
      grossPower: normalizeText(form.grossPower) || null,
      status,
      soldAt: null,
      media: mediaRows.length ? { create: mediaRows } : undefined,
    },
    select: { id: true },
  });

  return { action: 'created', seedKey: listing.seedKey, listingId: created.id, status };
};

const main = async () => {
  const seedFile = loadSeedFile();
  const results: Array<{ action: string; seedKey: string; listingId: string; status: string }> = [];
  const resetSummary = shouldResetBeforeSeed
    ? await resetExistingSeedListings(seedFile)
    : { deletedListings: 0, deletedMedia: 0 };

  for (const listing of seedFile.listings) {
    const result = await upsertListing(seedFile, listing);
    results.push(result);
  }

  console.log(
    JSON.stringify(
      {
        resetApplied: shouldResetBeforeSeed,
        resetSummary,
        totalListings: seedFile.listings.length,
        created: results.filter((item) => item.action === 'created').length,
        updated: results.filter((item) => item.action === 'updated').length,
        results,
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      // Ignore disconnect issues after script completion.
    }
  });
