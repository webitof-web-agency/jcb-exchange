import prisma from '../lib/prisma';

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
  const soldAt = new Date();

  return prismaAny.$transaction(async (tx: any) => {
    const listing = await tx.listing.findUnique({
      where: { id: payment.listingId },
      select: { id: true, status: true },
    });

    if (!listing) {
      return null;
    }

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
};
