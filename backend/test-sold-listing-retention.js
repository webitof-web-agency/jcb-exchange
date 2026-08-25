"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const prisma_1 = __importDefault(require("./src/lib/prisma"));
const documentUpload_1 = require("./src/utils/documentUpload");
const soldListingRetention_1 = require("./src/utils/soldListingRetention");
const prismaAny = prisma_1.default;
const now = new Date();
const uniqueSuffix = `sold-retention-${Date.now()}`;
const expiredSoldAt = new Date(now.getTime() - (soldListingRetention_1.SOLD_LISTING_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
const activeSoldAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
const expiredMediaFileName = `${uniqueSuffix}-expired.webp`;
const freshMediaFileName = `${uniqueSuffix}-fresh.webp`;
const expiredGalleryFileName = `${uniqueSuffix}-expired-gallery.webp`;
const expiredVideoFileName = `${uniqueSuffix}-expired-video.mp4`;
const expiredMediaUrl = `/uploads/public/listings/${expiredMediaFileName}`;
const freshMediaUrl = `/uploads/public/listings/${freshMediaFileName}`;
const expiredGalleryUrl = `/uploads/public/listings/${expiredGalleryFileName}`;
const expiredVideoUrl = `/uploads/public/listings/${expiredVideoFileName}`;
const expiredMediaPath = node_path_1.default.join(documentUpload_1.publicListingMediaUploadDir, expiredMediaFileName);
const freshMediaPath = node_path_1.default.join(documentUpload_1.publicListingMediaUploadDir, freshMediaFileName);
const expiredGalleryPath = node_path_1.default.join(documentUpload_1.publicListingMediaUploadDir, expiredGalleryFileName);
const expiredVideoPath = node_path_1.default.join(documentUpload_1.publicListingMediaUploadDir, expiredVideoFileName);
const cleanupTestData = async (ids) => {
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
    await (0, promises_1.rm)(expiredMediaPath, { force: true });
    await (0, promises_1.rm)(freshMediaPath, { force: true });
    await (0, promises_1.rm)(expiredGalleryPath, { force: true });
    await (0, promises_1.rm)(expiredVideoPath, { force: true });
};
const run = async () => {
    const ids = {};
    try {
        await (0, promises_1.mkdir)(documentUpload_1.publicListingMediaUploadDir, { recursive: true });
        await (0, promises_1.writeFile)(expiredMediaPath, 'expired-media');
        await (0, promises_1.writeFile)(freshMediaPath, 'fresh-media');
        await (0, promises_1.writeFile)(expiredGalleryPath, 'expired-gallery-media');
        await (0, promises_1.writeFile)(expiredVideoPath, 'expired-video-media');
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
        await (0, soldListingRetention_1.setListingSoldAt)(expiredListing.id, expiredSoldAt);
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
        await (0, soldListingRetention_1.setListingSoldAt)(freshListing.id, activeSoldAt);
        await prismaAny.lead.create({
            data: {
                listingId: expiredListing.id,
                customerId: customerUser.id,
                dealerId: partnerUser.id,
                enquiryType: 'CALL',
                status: 'NEW',
            },
        });
        const result = await (0, soldListingRetention_1.cleanupExpiredSoldListings)(now);
        strict_1.default.equal(result.deletedListingCount, 0, 'Expired sold listing should remain in the database.');
        strict_1.default.equal(result.detachedLeadCount, 0, 'Lead linkage should remain untouched for retained sold listings.');
        strict_1.default.equal(result.deletedMediaCount, 2, 'Only gallery image and video should be removed for the expired sold listing.');
        strict_1.default.ok(result.listingIds.includes(expiredListing.id), 'Expired listing id should still be reported as processed.');
        strict_1.default.ok(!result.listingIds.includes(freshListing.id), 'Fresh sold listing should not be processed.');
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
        strict_1.default.ok(retainedExpiredListing, 'Expired sold listing should still exist in the database.');
        strict_1.default.ok(survivingListing, 'Fresh sold listing should still exist in the database.');
        strict_1.default.ok(preservedLead, 'Lead should still exist for the retained sold listing.');
        strict_1.default.equal(preservedLead?.listingId ?? null, expiredListing.id, 'Lead should remain attached to the sold listing.');
        strict_1.default.equal(preservedLead?.listingTitleSnapshot ?? null, null, 'Lead snapshot should stay untouched when listing remains.');
        strict_1.default.equal(preservedLead?.listingStatusSnapshot ?? null, null, 'Lead status snapshot should stay untouched when listing remains.');
        strict_1.default.equal(Number(preservedLead?.listingPriceSnapshot || 0), 0, 'Lead price snapshot should stay untouched when listing remains.');
        strict_1.default.equal(preservedLead?.listingLocationCitySnapshot ?? null, null, 'Lead city snapshot should stay untouched when listing remains.');
        strict_1.default.equal(preservedLead?.listingLocationStateSnapshot ?? null, null, 'Lead state snapshot should stay untouched when listing remains.');
        strict_1.default.equal(retainedExpiredMedia.length, 1, 'Exactly one media record should remain on the expired sold listing.');
        strict_1.default.equal(retainedExpiredMedia[0]?.url, expiredMediaUrl, 'Front-view image should be preserved.');
        strict_1.default.equal(retainedExpiredMedia[0]?.type, 'IMAGE', 'Preserved sold listing media should remain an image.');
        strict_1.default.equal(retainedExpiredMedia[0]?.slot, 'front-view', 'Preserved sold listing media should be the front-view slot.');
        await strict_1.default.doesNotReject(() => prismaAny.media.findFirstOrThrow({ where: { listingId: freshListing.id } }));
        await strict_1.default.doesNotReject(() => (0, promises_1.rm)(expiredMediaPath));
        await strict_1.default.doesNotReject(() => (0, promises_1.rm)(freshMediaPath));
        await strict_1.default.rejects(() => (0, promises_1.rm)(expiredGalleryPath));
        await strict_1.default.rejects(() => (0, promises_1.rm)(expiredVideoPath));
        console.log('Sold listing retention cleanup test passed.');
    }
    finally {
        await cleanupTestData(ids);
        await prisma_1.default.$disconnect();
    }
};
void run().catch(async (error) => {
    console.error('Sold listing retention cleanup test failed.');
    console.error(error);
    await prisma_1.default.$disconnect();
    process.exit(1);
});
//# sourceMappingURL=test-sold-listing-retention.js.map