import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { detachLeadsFromListing } from '../utils/soldListingRetention';
import { getDriveFileIdsToDelete } from '../utils/driveMediaLifecycle';
import { deleteFileFromDrive } from './googleDrive.service';
import { availableModerationActions } from './listingModeration.service';
import {
  assertDeleteRequest,
  DeletionBlockedError,
  finishImpact,
  group,
  type DeletionAlternative,
  type DeletionImpact,
} from './deletionImpact';

// Permanent listing delete. Photos, videos and the verification snapshot go with the listing;
// enquiries and RTO records stay (unlinked). A listing that was sold or took money never goes:
// it is the sale history behind receipts, bills and the Sold Vehicle record.

type Db = Prisma.TransactionClient | typeof prisma;

export type ListingDeletionViewer = {
  id: string;
  role: string;
  isAdmin: boolean;
};

const listingSelect = {
  id: true,
  title: true,
  status: true,
  price: true,
  adminMarginAmount: true,
  adminExpenseAmount: true,
  adminExpenseBreakdown: true,
  locationCity: true,
  locationState: true,
  partnerId: true,
  partner: { select: { role: true } },
  saleRecord: { select: { id: true } },
  sellAccount: { select: { id: true } },
  vehicleVerification: { select: { id: true } },
  _count: { select: { media: true, leads: true, paymentSubmissions: true, rtoRecords: true } },
} as const;

/** Why a listing can never be deleted, or an empty list when it can. */
const listingHistoryCounts = async (db: Db, listing: any) => {
  const releasedSales = await db.sellAccount.count({ where: { releasedListingId: listing.id } });
  return {
    sold: String(listing.status || '').toUpperCase() === 'SOLD' ? 1 : 0,
    saleRecord: listing.saleRecord ? 1 : 0,
    payments: listing._count.paymentSubmissions,
    soldVehicleRecords: (listing.sellAccount ? 1 : 0) + releasedSales,
  };
};

// Hiding instead of deleting: the alternative's status is the moderation action to send.
const HIDE_INSTEAD: Record<string, DeletionAlternative> = {
  UNLIST: { status: 'UNLIST', label: 'Unlist', description: 'Hide it from the website. Everything is kept and it can be relisted any time.' },
  SUSPEND: { status: 'SUSPEND', label: 'Suspend', description: 'Hide it until the seller fixes it and sends it for review. The seller sees the reason.' },
  BLOCK: { status: 'BLOCK', label: 'Block', description: 'Hide it for good and stop this vehicle being listed again (fraud, stolen or fake).' },
};

const alternativesFor = (listing: any, viewer: ListingDeletionViewer): DeletionAlternative[] =>
  availableModerationActions(listing.status, { isAdmin: viewer.isAdmin, isOwner: listing.partnerId === viewer.id })
    .flatMap((action) => (HIDE_INSTEAD[action] ? [HIDE_INSTEAD[action]] : []));

const buildListingImpact = async (db: Db, listingId: string, viewer: ListingDeletionViewer) => {
  const listing = await (db as any).listing.findUnique({ where: { id: listingId }, select: listingSelect });
  if (!listing) return null;
  if (!viewer.isAdmin && listing.partnerId !== viewer.id) return null;

  const history = await listingHistoryCounts(db, listing);
  const superAdminListing = listing.partner?.role === 'SUPER_ADMIN' && viewer.role !== 'SUPER_ADMIN';
  const impact = finishImpact(
    {
      entityType: 'LISTING',
      entityId: listing.id,
      name: listing.title,
      subtitle: [listing.locationCity, listing.locationState].filter(Boolean).join(', '),
      currentStatus: String(listing.status),
      viewerCanDelete: !superAdminListing,
      viewerDeleteNote: superAdminListing ? 'Only a super admin can delete super admin listings.' : null,
      alternatives: alternativesFor(listing, viewer),
    },
    [
      group('media', 'Photos and videos on the listing', listing._count.media, 'DELETED'),
      group('mediaFiles', 'Also remove the photo and video files from Google Drive', listing._count.media, 'OPTIONAL',
        'Left unticked, the files stay in Google Drive but nothing in the app links to them.'),
      group('verification', 'Vehicle verification snapshot', listing.vehicleVerification ? 1 : 0, 'DELETED'),
      group('leads', 'Enquiries (leads)', listing._count.leads, 'UNLINKED', 'Kept in CRM with a copy of the listing title and price.'),
      group('rtoRecords', 'RTO records', listing._count.rtoRecords, 'UNLINKED', 'Kept; the link to this listing is cleared.'),
      group('sold', 'Sold listing', history.sold, 'BLOCKS', 'Sold listings stay as sale history.'),
      group('saleRecord', 'Sale record with buyer details', history.saleRecord, 'BLOCKS'),
      group('payments', 'Website payments and bills', history.payments, 'BLOCKS', 'Money records are never deleted.'),
      group('soldVehicleRecords', 'Sold Vehicle records', history.soldVehicleRecords, 'BLOCKS'),
      group('blocked', 'Blocked by JCB Exchange', !viewer.isAdmin && String(listing.status).toUpperCase() === 'BLOCKED' ? 1 : 0, 'BLOCKS', 'Contact support about a blocked listing.'),
    ],
  );
  return { listing, impact };
};

export const getListingDeletionImpact = async (listingId: string, viewer: ListingDeletionViewer): Promise<DeletionImpact | null> =>
  (await buildListingImpact(prisma, listingId, viewer))?.impact || null;

/**
 * Removes listings that have no sale or money history, inside the caller's transaction.
 * Returns the media URLs so the caller can remove the files after the transaction commits.
 */
export const removeListingsInTx = async (tx: Prisma.TransactionClient, listingIds: string[]) => {
  const mediaUrls: string[] = [];
  for (const listingId of listingIds) {
    const listing = await (tx as any).listing.findUnique({ where: { id: listingId }, select: listingSelect });
    if (!listing) continue;
    const history = await listingHistoryCounts(tx, listing);
    if (history.sold || history.saleRecord || history.payments || history.soldVehicleRecords) {
      throw new DeletionBlockedError(`Listing "${listing.title}" has sale or payment history and cannot be deleted.`);
    }
    await detachLeadsFromListing(tx, listing);
    const media = await tx.media.findMany({ where: { listingId }, select: { url: true } });
    mediaUrls.push(...media.map((item) => item.url));
    await tx.media.deleteMany({ where: { listingId } });
    await tx.listing.delete({ where: { id: listingId } });
  }
  return mediaUrls;
};

export const removeListingMediaFiles = async (mediaUrls: string[]) => {
  const fileIds = getDriveFileIdsToDelete(mediaUrls, []);
  // A missing Drive file must not undo a delete that has already been committed.
  await Promise.all(fileIds.map((fileId) => deleteFileFromDrive(fileId).catch((error) => {
    console.error('Failed to remove listing media from Drive:', fileId, error);
  })));
};

export const deleteListingPermanently = async (
  listingId: string,
  viewer: ListingDeletionViewer,
  request: { include?: unknown; confirmation?: unknown; reason?: unknown },
) => {
  const result = await prisma.$transaction(async (tx) => {
    const built = await buildListingImpact(tx, listingId, viewer);
    if (!built) return null;
    const { listing, impact } = built;
    if (!impact.viewerCanDelete) throw new DeletionBlockedError(impact.viewerDeleteNote || 'You cannot delete this listing.', impact);
    const { reason, include } = assertDeleteRequest(impact, request, { requireReason: viewer.isAdmin && listing.partnerId !== viewer.id });

    const mediaUrls = await removeListingsInTx(tx, [listing.id]);
    await tx.auditLog.create({
      data: {
        actorUserId: viewer.id,
        entityType: 'LISTING',
        entityId: listing.id,
        action: 'LISTING_PERMANENTLY_DELETED',
        beforeJson: {
          title: listing.title,
          status: listing.status,
          partnerId: listing.partnerId,
          reason: reason || null,
          removed: Object.fromEntries(impact.groups.map((item) => [item.key, { count: item.count, action: item.action, ...(item.action === 'OPTIONAL' ? { chosen: include.has(item.key) } : {}) }])),
        },
      },
    });
    return { mediaUrls: include.has('mediaFiles') ? mediaUrls : [] };
  }, { maxWait: 10_000, timeout: 60_000 });
  if (!result) return null;
  await removeListingMediaFiles(result.mediaUrls);
  return true;
};
