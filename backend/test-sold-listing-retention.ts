import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import prisma from './src/lib/prisma';
import { publicListingMediaUploadDir } from './src/utils/documentUpload';
import {
  SOLD_LISTING_RETENTION_DAYS,
  cleanupExpiredSoldListings,
  setListingSoldAt,
} from './src/utils/soldListingRetention';

const prismaAny = prisma as any;

const now = new Date();
const uniqueSuffix = `sold-retention-${Date.now()}`;
const expiredSoldAt = new Date(now.getTime() - (SOLD_LISTING_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
const activeSoldAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

const expiredMediaFileName = `${uniqueSuffix}-expired.webp`;
const freshMediaFileName = `${uniqueSuffix}-fresh.webp`;
const expiredGalleryFileName = `${uniqueSuffix}-expired-gallery.webp`;
const expiredVideoFileName = `${uniqueSuffix}-expired-video.mp4`;
const expiredMediaUrl = `/uploads/public/listings/${expiredMediaFileName}`;
const freshMediaUrl = `/uploads/public/listings/${freshMediaFileName}`;
const expiredGalleryUrl = `/uploads/public/listings/${expiredGalleryFileName}`;
const expiredVideoUrl = `/uploads/public/listings/${expiredVideoFileName}`;
const expiredMediaPath = path.join(publicListingMediaUploadDir, expiredMediaFileName);
const freshMediaPath = path.join(publicListingMediaUploadDir, freshMediaFileName);
const expiredGalleryPath = path.join(publicListingMediaUploadDir, expiredGalleryFileName);
const expiredVideoPath = path.join(publicListingMediaUploadDir, expiredVideoFileName);

const cleanupTestData = async (ids: {
  expiredListingId?: string;
  freshListingId?: string;
  categoryId?: string;
  modelId?: string;
  brandId?: string;
  customerUserId?: string;
  partnerProfileId?: string;
  partnerUserId?: string;
}) => {
  if (ids.expiredListingId || ids.freshListingId) {
    const listingIds = [ids.expiredListingId, ids.freshListingId].filter(Boolean);
    await prismaAny.lead.deleteMany({ where: { listingId: { in: listingIds } } });
    await prismaAny.media.deleteMany({ where: { listingId: { in: listingIds } } });
    await prismaAny.listing.deleteMany({ where: { id: { in: listingIds } } });
  }

  if (ids.modelId) {
    await prismaAny.model.deleteMany({ where: { id: ids.modelId } });
  }

  if (ids.brandId) {
    await prismaAny.brand.deleteMany({ where: { id: ids.brandId } });
  }

  if (ids.categoryId) {
    await prismaAny.category.deleteMany({ where: { id: ids.categoryId } });
  }

  if (ids.partnerProfileId) {
    await prismaAny.partnerProfile.deleteMany({ where: { id: ids.partnerProfileId } });
  }

  if (ids.customerUserId || ids.partnerUserId) {
    const userIds = [ids.customerUserId, ids.partnerUserId].filter(Boolean);
    await prismaAny.lead.deleteMany({
      where: {
        OR: [
          { customerId: { in: userIds } },
          { dealerId: { in: userIds } },
        ],
      },
    });
  }

  if (ids.customerUserId || ids.partnerUserId) {
    const userIds = [ids.customerUserId, ids.partnerUserId].filter(Boolean);
    await prismaAny.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await rm(expiredMediaPath, { force: true });
  await rm(freshMediaPath, { force: true });
  await rm(expiredGalleryPath, { force: true });
  await rm(expiredVideoPath, { force: true });
};

const run = async () => {
  const ids: {
    expiredListingId?: string;
    freshListingId?: string;
    categoryId?: string;
    modelId?: string;
    brandId?: string;
    customerUserId?: string;
    partnerProfileId?: string;
    partnerUserId?: string;
  } = {};

  try {
    await mkdir(publicListingMediaUploadDir, { recursive: true });
    await writeFile(expiredMediaPath, 'expired-media');
    await writeFile(freshMediaPath, 'fresh-media');
    await writeFile(expiredGalleryPath, 'expired-gallery-media');
    await writeFile(expiredVideoPath, 'expired-video-media');

    const partnerUser = await prismaAny.user.create({
      data: {
        email: `${uniqueSuffix}-partner@example.com`,
        name: 'Retention Partner',
        role: 'PARTNER',
        status: 'ACTIVE',
      },
    });
    ids.partnerUserId = partnerUser.id;

    const customerUser = await prismaAny.user.create({
      data: {
        email: `${uniqueSuffix}-customer@example.com`,
        name: 'Retention Customer',
        role: 'CUSTOMER',
        status: 'ACTIVE',
      },
    });
    ids.customerUserId = customerUser.id;

    const partnerProfile = await prismaAny.partnerProfile.create({
      data: {
        userId: partnerUser.id,
        businessName: 'Retention Test Dealer',
        onboardingStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
        kycStatus: 'APPROVED',
      },
    });
    ids.partnerProfileId = partnerProfile.id;

    const category = await prismaAny.category.create({
      data: {
        name: `Retention Category ${uniqueSuffix}`,
      },
    });
    ids.categoryId = category.id;

    const brand = await prismaAny.brand.create({
      data: {
        name: `Retention Brand ${uniqueSuffix}`,
      },
    });
    ids.brandId = brand.id;

    const model = await prismaAny.model.create({
      data: {
        brandId: brand.id,
        name: `Retention Model ${uniqueSuffix}`,
      },
    });
    ids.modelId = model.id;

    const expiredListing = await prismaAny.listing.create({
      data: {
        partnerId: partnerUser.id,
        categoryId: category.id,
        brandId: brand.id,
        modelId: model.id,
        title: `Expired Sold Listing ${uniqueSuffix}`,
        price: 100000,
        manufacturingYear: 2020,
        locationState: 'Chhattisgarh',
        locationCity: 'Raipur',
        status: 'SOLD',
        media: {
          create: [
            {
              url: expiredMediaUrl,
              type: 'IMAGE',
              slot: 'front-view',
              isFeatured: true,
            },
            {
              url: expiredGalleryUrl,
              type: 'IMAGE',
              slot: 'left-view',
              isFeatured: false,
            },
            {
              url: expiredVideoUrl,
              type: 'VIDEO',
              isFeatured: false,
            },
          ],
        },
      },
    });
    ids.expiredListingId = expiredListing.id;
    await setListingSoldAt(expiredListing.id, expiredSoldAt);

    const freshListing = await prismaAny.listing.create({
      data: {
        partnerId: partnerUser.id,
        categoryId: category.id,
        brandId: brand.id,
        modelId: model.id,
        title: `Fresh Sold Listing ${uniqueSuffix}`,
        price: 200000,
        manufacturingYear: 2021,
        locationState: 'Chhattisgarh',
        locationCity: 'Raipur',
        status: 'SOLD',
        media: {
          create: [
            {
              url: freshMediaUrl,
              type: 'IMAGE',
              isFeatured: true,
            },
          ],
        },
      },
    });
    ids.freshListingId = freshListing.id;
    await setListingSoldAt(freshListing.id, activeSoldAt);

    await prismaAny.lead.create({
      data: {
        listingId: expiredListing.id,
        customerId: customerUser.id,
        dealerId: partnerUser.id,
        enquiryType: 'CALL',
        status: 'NEW',
      },
    });

    const result = await cleanupExpiredSoldListings(now);

    assert.equal(result.deletedListingCount, 0, 'Expired sold listing should remain in the database.');
    assert.equal(result.detachedLeadCount, 0, 'Lead linkage should remain untouched for retained sold listings.');
    assert.equal(result.deletedMediaCount, 2, 'Only gallery image and video should be removed for the expired sold listing.');
    assert.ok(result.listingIds.includes(expiredListing.id), 'Expired listing id should still be reported as processed.');
    assert.ok(!result.listingIds.includes(freshListing.id), 'Fresh sold listing should not be processed.');

    const retainedExpiredListing = await prismaAny.listing.findUnique({ where: { id: expiredListing.id } });
    const survivingListing = await prismaAny.listing.findUnique({ where: { id: freshListing.id } });
    const preservedLead = await prismaAny.lead.findFirst({
      where: { dealerId: partnerUser.id },
      select: {
        listingId: true,
        listingTitleSnapshot: true,
        listingStatusSnapshot: true,
        listingPriceSnapshot: true,
        listingLocationCitySnapshot: true,
        listingLocationStateSnapshot: true,
      },
    });
    const retainedExpiredMedia = await prismaAny.media.findMany({
      where: { listingId: expiredListing.id },
      orderBy: { createdAt: 'asc' },
      select: {
        url: true,
        type: true,
        slot: true,
      },
    });

    assert.ok(retainedExpiredListing, 'Expired sold listing should still exist in the database.');
    assert.ok(survivingListing, 'Fresh sold listing should still exist in the database.');
    assert.ok(preservedLead, 'Lead should still exist for the retained sold listing.');
    assert.equal(preservedLead?.listingId ?? null, expiredListing.id, 'Lead should remain attached to the sold listing.');
    assert.equal(preservedLead?.listingTitleSnapshot ?? null, null, 'Lead snapshot should stay untouched when listing remains.');
    assert.equal(preservedLead?.listingStatusSnapshot ?? null, null, 'Lead status snapshot should stay untouched when listing remains.');
    assert.equal(Number(preservedLead?.listingPriceSnapshot || 0), 0, 'Lead price snapshot should stay untouched when listing remains.');
    assert.equal(preservedLead?.listingLocationCitySnapshot ?? null, null, 'Lead city snapshot should stay untouched when listing remains.');
    assert.equal(preservedLead?.listingLocationStateSnapshot ?? null, null, 'Lead state snapshot should stay untouched when listing remains.');
    assert.equal(retainedExpiredMedia.length, 1, 'Exactly one media record should remain on the expired sold listing.');
    assert.equal(retainedExpiredMedia[0]?.url, expiredMediaUrl, 'Front-view image should be preserved.');
    assert.equal(retainedExpiredMedia[0]?.type, 'IMAGE', 'Preserved sold listing media should remain an image.');
    assert.equal(retainedExpiredMedia[0]?.slot, 'front-view', 'Preserved sold listing media should be the front-view slot.');

    await assert.doesNotReject(() => prismaAny.media.findFirstOrThrow({ where: { listingId: freshListing.id } }));

    await assert.doesNotReject(() => rm(expiredMediaPath));
    await assert.doesNotReject(() => rm(freshMediaPath));
    await assert.rejects(() => rm(expiredGalleryPath));
    await assert.rejects(() => rm(expiredVideoPath));

    console.log('Sold listing retention cleanup test passed.');
  } finally {
    await cleanupTestData(ids);
    await prisma.$disconnect();
  }
};

void run().catch(async (error) => {
  console.error('Sold listing retention cleanup test failed.');
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
