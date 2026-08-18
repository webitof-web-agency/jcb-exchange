import { rm } from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';
import { publicListingMediaUploadDir } from './documentUpload';

const prismaAny = prisma as any;

export const SOLD_LISTING_RETENTION_DAYS = 30;
export const SOLD_LISTING_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let retentionJobStarted = false;

const normalizeStatus = (value: unknown) => String(value || '').trim().toUpperCase();

export const getSoldListingCutoff = (now = new Date()) =>
  new Date(now.getTime() - SOLD_LISTING_RETENTION_DAYS * 24 * 60 * 60 * 1000);

type ListingSnapshot = {
  id: string;
  title?: string | null;
  status?: string | null;
  price?: number | { toString(): string } | null;
  locationCity?: string | null;
  locationState?: string | null;
};

export const getSoldAtValueForStatus = ({
  nextStatus,
  previousStatus,
  previousSoldAt,
  now = new Date(),
}: {
  nextStatus: string;
  previousStatus?: string | null;
  previousSoldAt?: Date | null;
  now?: Date;
}) => {
  if (normalizeStatus(nextStatus) !== 'SOLD') {
    return null;
  }

  if (normalizeStatus(previousStatus) === 'SOLD' && previousSoldAt instanceof Date) {
    return previousSoldAt;
  }

  return now;
};

const resolveListingMediaPath = (url: string) => {
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

  return path.join(publicListingMediaUploadDir, fileName);
};

const deleteListingMediaFiles = async (urls: string[]) => {
  const results = await Promise.all(
    urls.map(async (url) => {
      const filePath = resolveListingMediaPath(url);
      if (!filePath) {
        return 0;
      }

      try {
        await rm(filePath, { force: true });
        return 1;
      } catch {
        // Ignore media cleanup failures for already-missing files.
        return 0;
      }
    })
  );

  return results.reduce<number>((total, current) => total + current, 0);
};

export const cleanupExpiredSoldListings = async (now = new Date()) => {
  const cutoff = getSoldListingCutoff(now);
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
        select: {
          url: true,
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
      listingIds: [] as string[],
    };
  }

  const listingIds = expiredSoldListings.map((listing: { id: string }) => listing.id);
  const mediaUrls = expiredSoldListings.flatMap((listing: { media: Array<{ url: string }> }) =>
    listing.media.map((media) => media.url)
  );

  let detachedLeadCount = 0;

  await prismaAny.$transaction(async (tx: any) => {
    for (const listing of expiredSoldListings) {
      detachedLeadCount += await detachLeadsFromListing(tx, listing);
    }

    await tx.media.deleteMany({
      where: {
        listingId: {
          in: listingIds,
        },
      },
    });

    await tx.listing.deleteMany({
      where: {
        id: {
          in: listingIds,
        },
      },
    });
  });
  const deletedFileCount = await deleteListingMediaFiles(mediaUrls);

  return {
    deletedListingCount: listingIds.length,
    detachedLeadCount,
    deletedMediaCount: mediaUrls.length,
    deletedFileCount,
    listingIds,
  };
};

export const setListingSoldAt = async (listingId: string, soldAt: Date | null) => {
  await prismaAny.$executeRaw`
    UPDATE "Listing"
    SET "soldAt" = ${soldAt}
    WHERE "id" = ${listingId}
  `;
};

export const detachLeadsFromListing = async (
  tx: any,
  listing: ListingSnapshot
) => {
  const result = await tx.$executeRaw`
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

const runCleanupCycle = async () => {
  try {
    await cleanupExpiredSoldListings();
  } catch (error) {
    console.error('Sold listing retention cleanup failed.', error);
  }
};

export const startSoldListingRetentionJob = () => {
  if (retentionJobStarted) {
    return;
  }

  retentionJobStarted = true;
  void runCleanupCycle();

  const interval = setInterval(() => {
    void runCleanupCycle();
  }, SOLD_LISTING_CLEANUP_INTERVAL_MS);

  interval.unref();
};
