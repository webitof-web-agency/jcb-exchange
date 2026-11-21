import { Prisma } from '@prisma/client';
import { detachLeadsFromListing } from '../utils/soldListingRetention';
import { toVehicleIdentityKey } from './listingVehicleIdentity';

export interface SyncListingSoldOptions {
  actorId?: string;
  sourceReason?: string;
}

export interface SyncListingSoldResult {
  listingId: string;
  status: 'SOLD';
  soldAt: Date;
  saleRecordCreated: boolean;
}

/**
 * Industry-standard synchronization:
 * When a Deal (SellAccount) reaches 100% full customer payment or completes as DEAL_DONE,
 * the corresponding vehicle Listing MUST be automatically marked as 'SOLD',
 * the soldAt timestamp recorded, the confidential SaleRecord created/upserted with
 * buyer and invoice details, and active leads detached from the marketplace.
 *
 * This ensures:
 * 1. The vehicle immediately moves out of active available inventory (/machines).
 * 2. The vehicle immediately appears in public sold inventory (/sold-vehicles).
 * 3. The Platform Listings show availability badge as SOLD and Sell Vehicle as Sold.
 * 4. All financial & buyer details remain strictly confidential and audit-trailed in SaleRecord.
 */
export const syncListingSoldStatusFromSellAccount = async (
  tx: any,
  sellAccount: {
    id: string;
    recordNumber?: string | null;
    listingId?: string | null;
    vehicleNumber?: string | null;
    purchaserName?: string | null;
    purchaserNumber?: string | null;
    purchaserCity?: string | null;
    purchaserState?: string | null;
    sellAmount?: unknown;
    invoiceNumber?: string | null;
    completedAt?: Date | null;
    cancelledAt?: Date | null;
    dealStatus?: string | null;
    isLocked?: boolean;
  },
  isFullyPaid: boolean,
  options?: SyncListingSoldOptions,
): Promise<SyncListingSoldResult | null> => {
  // Never auto-mark sold if the deal is cancelled
  if (sellAccount.cancelledAt) {
    return null;
  }

  const isDealDone = sellAccount.dealStatus === 'DEAL_DONE';
  if (!isFullyPaid && !isDealDone) {
    return null;
  }

  // 1. Resolve listing: check direct listingId first
  let listingId = sellAccount.listingId;
  let listing: any = null;

  if (listingId) {
    listing = await tx.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        status: true,
        soldAt: true,
        title: true,
        price: true,
        locationCity: true,
        locationState: true,
      },
    });
  }

  // Fallback: If listingId is not directly set on SellAccount, match by vehicle registration key
  if (!listing && sellAccount.vehicleNumber) {
    const regKey = toVehicleIdentityKey(sellAccount.vehicleNumber);
    if (regKey) {
      listing = await tx.listing.findFirst({
        where: {
          registrationNumberKey: regKey,
          status: { not: 'REJECTED' },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          soldAt: true,
          title: true,
          price: true,
          locationCity: true,
          locationState: true,
        },
      });

      if (listing) {
        listingId = listing.id;
        // Bind the listing to this SellAccount if not already linked
        if (!sellAccount.listingId) {
          await tx.sellAccount.update({
            where: { id: sellAccount.id },
            data: { listingId: listing.id, listingTitle: listing.title },
          });
        }
      }
    }
  }

  if (!listing || !listingId) {
    return null;
  }

  const now = new Date();
  const soldAt =
    listing.status === 'SOLD' && listing.soldAt
      ? listing.soldAt
      : sellAccount.completedAt || now;

  // 2. Mark listing as SOLD if not already SOLD or if soldAt is missing
  if (listing.status !== 'SOLD' || !listing.soldAt) {
    await tx.listing.update({
      where: { id: listingId },
      data: {
        status: 'SOLD',
        soldAt,
      },
    });
  }

  // 3. Upsert confidential SaleRecord with buyer & deal invoice details
  const rawPrice = sellAccount.sellAmount;
  const soldPrice =
    rawPrice instanceof Prisma.Decimal
      ? rawPrice
      : typeof rawPrice === 'number' || typeof rawPrice === 'string'
      ? new Prisma.Decimal(String(rawPrice))
      : new Prisma.Decimal(0);

  const buyerName = sellAccount.purchaserName?.trim() || 'Customer';
  const buyerPhone = sellAccount.purchaserNumber?.trim() || 'N/A';
  const buyerCity = sellAccount.purchaserCity?.trim() || null;
  const buyerState = sellAccount.purchaserState?.trim() || null;
  const invoiceNo = sellAccount.invoiceNumber?.trim() || null;
  const dealRef = sellAccount.recordNumber || sellAccount.id;
  const notes = `Auto-sold via Deal Desk: ${dealRef}${
    isDealDone ? ' (DEAL_DONE)' : ' (100% Full Payment)'
  }${options?.sourceReason ? ` - ${options.sourceReason}` : ''}`;

  await tx.saleRecord.upsert({
    where: { listingId },
    update: {
      buyerName,
      buyerPhone,
      buyerCity,
      buyerState,
      soldPrice,
      soldAt,
      invoiceNo,
      notes,
    },
    create: {
      listingId,
      buyerName,
      buyerPhone,
      buyerCity,
      buyerState,
      soldPrice,
      soldAt,
      invoiceNo,
      notes,
    },
  });

  // 4. Detach active marketplace leads cleanly
  try {
    await detachLeadsFromListing(tx, {
      id: listing.id,
      title: listing.title,
      status: 'SOLD',
      price: listing.price,
      locationCity: listing.locationCity,
      locationState: listing.locationState,
    });
  } catch (leadError) {
    // Non-fatal if lead detachment encounters a concurrent update
    console.warn(`[syncListingSoldStatusFromSellAccount] detachLeads warning for listing ${listingId}:`, leadError);
  }

  return {
    listingId,
    status: 'SOLD',
    soldAt,
    saleRecordCreated: true,
  };
};
