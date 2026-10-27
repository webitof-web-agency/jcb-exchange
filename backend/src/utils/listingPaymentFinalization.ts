import prisma from '../lib/prisma';
import { recordListingPaymentOnSale } from '../services/sellAccount.service';

const prismaAny = prisma as any;

const payableStatuses = new Set(['PAID', 'APPROVED']);

export const finalizeListingPaymentSale = async (paymentId: string) => {
  if (!paymentId) {
    return null;
  }

  const payment = await prismaAny.listingPaymentSubmission.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      status: true,
      amount: true,
      listingId: true,
      buyer: {
        select: {
          id: true,
          name: true,
          mobile: true,
          email: true,
          city: true,
          state: true,
        },
      },
    },
  });

  if (!payment || !payableStatuses.has(String(payment.status))) {
    return null;
  }

  const buyerName = payment.buyer?.name || payment.buyer?.mobile || payment.buyer?.email || 'Customer';
  const buyerPhone = payment.buyer?.mobile || payment.buyer?.email || payment.buyer?.id || 'N/A';

  const sold = await prismaAny.$transaction(async (tx: any) => {
    const listing = await tx.listing.findUnique({
      where: { id: payment.listingId },
      select: { id: true, status: true, soldAt: true },
    });

    if (!listing) {
      return null;
    }

    // Payment status checks can be repeated (e.g. the return page is refreshed);
    // keep the original sale date so retention and reports are not shifted.
    const soldAt = listing.status === 'SOLD' && listing.soldAt ? listing.soldAt : new Date();

    await tx.listing.update({
      where: { id: payment.listingId },
      data: {
        status: 'SOLD',
        soldAt,
      },
    });

    await tx.saleRecord.upsert({
      where: { listingId: payment.listingId },
      update: {
        buyerName,
        buyerPhone,
        buyerCity: payment.buyer?.city || null,
        buyerState: payment.buyer?.state || null,
        soldPrice: payment.amount,
        soldAt,
        notes: `Sold via ${payment.status} listing payment ${payment.id}`,
      },
      create: {
        listingId: payment.listingId,
        buyerName,
        buyerPhone,
        buyerCity: payment.buyer?.city || null,
        buyerState: payment.buyer?.state || null,
        soldPrice: payment.amount,
        soldAt,
        notes: `Sold via ${payment.status} listing payment ${payment.id}`,
      },
    });

    await tx.listingPaymentSubmission.updateMany({
      where: {
        listingId: payment.listingId,
        id: { not: payment.id },
        status: 'PENDING_VERIFICATION',
      },
      data: {
        status: 'FAILED',
        rejectionReason: 'Listing was sold through another completed payment.',
      },
    });

    return { listingId: payment.listingId };
  });

  // Put the payment on the vehicle's Sold Vehicle record (a draft one if none exists) so RTO work and
  // the books continue from Accounts. Never blocks the payment itself.
  if (sold) {
    try {
      await recordListingPaymentOnSale(payment.id);
    } catch (error) {
      console.error(`[listing-payment] could not record payment ${payment.id} on a Sold Vehicle record`, error);
    }
  }
  return sold;
};
