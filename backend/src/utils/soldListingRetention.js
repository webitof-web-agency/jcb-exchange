"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSoldListingRetentionJob = exports.detachLeadsFromListing = exports.setListingSoldAt = exports.cleanupExpiredSoldListings = exports.getSoldAtValueForStatus = exports.getSoldListingCutoff = exports.SOLD_LISTING_CLEANUP_INTERVAL_MS = exports.SOLD_LISTING_RETENTION_DAYS = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const documentUpload_1 = require("./documentUpload");
const prismaAny = prisma_1.default;
exports.SOLD_LISTING_RETENTION_DAYS = 30;
exports.SOLD_LISTING_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
let retentionJobStarted = false;
const normalizeStatus = (value) => String(value || '').trim().toUpperCase();
const getSoldListingCutoff = (now = new Date()) => new Date(now.getTime() - exports.SOLD_LISTING_RETENTION_DAYS * 24 * 60 * 60 * 1000);
exports.getSoldListingCutoff = getSoldListingCutoff;
const getSoldAtValueForStatus = ({ nextStatus, previousStatus, previousSoldAt, now = new Date(), }) => {
    if (normalizeStatus(nextStatus) !== 'SOLD') {
        return null;
    }
    if (normalizeStatus(previousStatus) === 'SOLD' && previousSoldAt instanceof Date) {
        return previousSoldAt;
    }
    return now;
};
exports.getSoldAtValueForStatus = getSoldAtValueForStatus;
const resolveListingMediaPath = (url) => {
    const normalizedUrl = String(url || '').replace(/\\/g, '/');
    const pathMarker = '/uploads/public/listings/';
    const markerIndex = normalizedUrl.indexOf(pathMarker);
    if (markerIndex === -1) {
        return null;
    }
    const fileName = normalizedUrl.slice(markerIndex + pathMarker.length).trim();
    if (!fileName || fileName.includes('..')) {
        return null;
    }
    return node_path_1.default.join(documentUpload_1.publicListingMediaUploadDir, fileName);
};
const deleteListingMediaFiles = async (urls) => {
    const results = await Promise.all(urls.map(async (url) => {
        const filePath = resolveListingMediaPath(url);
        if (!filePath) {
            return 0;
        }
        try {
            await (0, promises_1.rm)(filePath, { force: true });
            return 1;
        }
        catch {
            // Ignore media cleanup failures for already-missing files.
            return 0;
        }
    }));
    return results.reduce((total, current) => total + current, 0);
};
const normalizeMediaType = (value) => String(value || '').trim().toUpperCase();
const normalizeMediaSlot = (value) => String(value || '').trim().toLowerCase();
const getPreservedMediaId = (media) => {
    const images = media.filter((item) => normalizeMediaType(item.type) === 'IMAGE');
    if (!images.length) {
        return null;
    }
    const preferredImage = images.find((item) => normalizeMediaSlot(item.slot) === 'front-view') ||
        images.find((item) => item.isFeatured) ||
        images[0];
    return preferredImage?.id ?? null;
};
const cleanupExpiredSoldListings = async (now = new Date()) => {
    const cutoff = (0, exports.getSoldListingCutoff)(now);
    const expiredSoldListings = await prismaAny.listing.findMany({
        where: {
            status: 'SOLD',
            OR: [
                { soldAt: { lte: cutoff } },
                {
                    soldAt: null,
                    updatedAt: { lte: cutoff },
                },
            ],
        },
        select: {
            id: true,
            title: true,
            status: true,
            price: true,
            locationCity: true,
            locationState: true,
            media: {
                orderBy: {
                    createdAt: 'asc',
                },
                select: {
                    id: true,
                    url: true,
                    type: true,
                    slot: true,
                    isFeatured: true,
                },
            },
        },
    });
    if (expiredSoldListings.length === 0) {
        return {
            deletedListingCount: 0,
            detachedLeadCount: 0,
            deletedMediaCount: 0,
            deletedFileCount: 0,
            listingIds: [],
        };
    }
    const listingIds = expiredSoldListings.map((listing) => listing.id);
    const mediaToDelete = expiredSoldListings.flatMap((listing) => {
        const preservedMediaId = getPreservedMediaId(listing.media);
        return listing.media.filter((media) => media.id !== preservedMediaId);
    });
    const mediaIdsToDelete = mediaToDelete.map((media) => media.id);
    const mediaUrlsToDelete = mediaToDelete.map((media) => media.url);
    if (mediaIdsToDelete.length > 0) {
        await prismaAny.media.deleteMany({
            where: {
                id: {
                    in: mediaIdsToDelete,
                },
            },
        });
    }
    const deletedFileCount = await deleteListingMediaFiles(mediaUrlsToDelete);
    return {
        deletedListingCount: 0,
        detachedLeadCount: 0,
        deletedMediaCount: mediaIdsToDelete.length,
        deletedFileCount,
        listingIds,
    };
};
exports.cleanupExpiredSoldListings = cleanupExpiredSoldListings;
const setListingSoldAt = async (listingId, soldAt) => {
    await prismaAny.$executeRaw `
    UPDATE "Listing"
    SET "soldAt" = ${soldAt}
    WHERE "id" = ${listingId}
  `;
};
exports.setListingSoldAt = setListingSoldAt;
const detachLeadsFromListing = async (tx, listing) => {
    const result = await tx.$executeRaw `
    UPDATE "Lead"
    SET
      "listingId" = NULL,
      "listingTitleSnapshot" = ${listing.title || 'Listing removed'},
      "listingStatusSnapshot" = ${String(listing.status || '').toUpperCase() || 'REMOVED'},
      "listingPriceSnapshot" = ${listing.price === null || listing.price === undefined ? null : String(listing.price)},
      "listingLocationCitySnapshot" = ${listing.locationCity || null},
      "listingLocationStateSnapshot" = ${listing.locationState || null}
    WHERE "listingId" = ${listing.id}
  `;
    return Number(result || 0);
};
exports.detachLeadsFromListing = detachLeadsFromListing;
const runCleanupCycle = async () => {
    try {
        await (0, exports.cleanupExpiredSoldListings)();
    }
    catch (error) {
        console.error('Sold listing retention cleanup failed.', error);
    }
};
const startSoldListingRetentionJob = () => {
    if (retentionJobStarted) {
        return;
    }
    retentionJobStarted = true;
    void runCleanupCycle();
    const interval = setInterval(() => {
        void runCleanupCycle();
    }, exports.SOLD_LISTING_CLEANUP_INTERVAL_MS);
    interval.unref();
};
exports.startSoldListingRetentionJob = startSoldListingRetentionJob;
//# sourceMappingURL=soldListingRetention.js.map