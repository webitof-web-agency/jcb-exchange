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
const expiredMediaUrl = `/uploads/public/listings/${expiredMediaFileName}`;
const freshMediaUrl = `/uploads/public/listings/${freshMediaFileName}`;
const expiredMediaPath = node_path_1.default.join(documentUpload_1.publicListingMediaUploadDir, expiredMediaFileName);
const freshMediaPath = node_path_1.default.join(documentUpload_1.publicListingMediaUploadDir, freshMediaFileName);
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
};
const run = async () => {
    const ids = {};
    try {
        await (0, promises_1.mkdir)(documentUpload_1.publicListingMediaUploadDir, { recursive: true });
        await (0, promises_1.writeFile)(expiredMediaPath, 'expired-media');
        await (0, promises_1.writeFile)(freshMediaPath, 'fresh-media');
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
                            isFeatured: true,
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
        strict_1.default.equal(result.deletedListingCount, 1, 'Exactly one expired sold listing should be deleted.');
        strict_1.default.equal(result.detachedLeadCount, 1, 'Related lead should be detached and preserved.');
        strict_1.default.equal(result.deletedMediaCount, 1, 'Related media record should be deleted with the expired sold listing.');
        strict_1.default.ok(result.listingIds.includes(expiredListing.id), 'Expired listing id should be reported as deleted.');
        strict_1.default.ok(!result.listingIds.includes(freshListing.id), 'Fresh sold listing should not be deleted.');
        const deletedListing = await prismaAny.listing.findUnique({ where: { id: expiredListing.id } });
        const survivingListing = await prismaAny.listing.findUnique({ where: { id: freshListing.id } });
        const detachedLead = await prismaAny.lead.findFirst({
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
        const deletedMediaCount = await prismaAny.media.count({ where: { listingId: expiredListing.id } });
        strict_1.default.equal(deletedListing, null, 'Expired sold listing should no longer exist in the database.');
        strict_1.default.ok(survivingListing, 'Fresh sold listing should still exist in the database.');
        strict_1.default.ok(detachedLead, 'Expired sold listing lead should still exist.');
        strict_1.default.equal(detachedLead?.listingId ?? null, null, 'Expired sold listing lead should be detached from the listing.');
        strict_1.default.equal(detachedLead?.listingTitleSnapshot, `Expired Sold Listing ${uniqueSuffix}`, 'Lead should retain listing title snapshot.');
        strict_1.default.equal(detachedLead?.listingStatusSnapshot, 'SOLD', 'Lead should retain listing status snapshot.');
        strict_1.default.equal(Number(detachedLead?.listingPriceSnapshot || 0), 100000, 'Lead should retain listing price snapshot.');
        strict_1.default.equal(detachedLead?.listingLocationCitySnapshot, 'Raipur', 'Lead should retain listing city snapshot.');
        strict_1.default.equal(detachedLead?.listingLocationStateSnapshot, 'Chhattisgarh', 'Lead should retain listing state snapshot.');
        strict_1.default.equal(deletedMediaCount, 0, 'Expired sold listing media records should be removed.');
        await strict_1.default.rejects(() => prismaAny.media.findFirstOrThrow({ where: { listingId: expiredListing.id } }));
        await strict_1.default.doesNotReject(() => prismaAny.media.findFirstOrThrow({ where: { listingId: freshListing.id } }));
        await strict_1.default.rejects(() => (0, promises_1.rm)(expiredMediaPath));
        await strict_1.default.doesNotReject(() => (0, promises_1.rm)(freshMediaPath));
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