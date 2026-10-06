import type { NextFunction, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { normalizeListingBillPayload, type ListingBillType } from '../utils/listingBillPayload';

const prismaAny = prisma as any;

const listingBillInclude = {
  payment: {
    select: {
      id: true,
      method: true,
      status: true,
      amount: true,
      transactionRef: true,
      submittedAt: true,
      buyer: { select: { name: true, mobile: true, email: true, city: true, state: true } },
      partner: { select: { name: true, mobile: true, email: true } },
      listing: { select: { id: true, title: true } },
    },
  },
};

const mapListingBill = (bill: any) => ({
  id: bill.id,
  paymentId: bill.paymentId,
  billType: bill.billType,
  payload: bill.payload,
  createdAt: bill.createdAt,
  updatedAt: bill.updatedAt,
  payment: bill.payment
    ? {
      ...bill.payment,
      amount: Number(bill.payment.amount || 0),
      submittedAt: bill.payment.submittedAt?.toISOString?.() || bill.payment.submittedAt,
    }
    : null,
});

const getBillType = (value: unknown): ListingBillType => {
  const billType = String(value || '').trim().toUpperCase();
  if (billType !== 'NON_TAX' && billType !== 'TAX_INVOICE') {
    throw new Error('A valid bill type is required.');
  }
  return billType;
};

export const getListingBills = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paymentId = String(req.query.paymentId || '').trim();
    const bills = await prismaAny.listingBill.findMany({
      where: paymentId ? { paymentId } : undefined,
      include: listingBillInclude,
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ bills: bills.map(mapListingBill) });
  } catch (error) {
    next(error);
  }
};

export const saveListingBill = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paymentId = String(req.body?.paymentId || '').trim();
    if (!paymentId) {
      return res.status(400).json({ error: 'Payment reference is required to save a bill.' });
    }

    const payload = normalizeListingBillPayload(req.body?.payload);
    const billType = getBillType(payload.invoiceType);
    const payment = await prismaAny.listingPaymentSubmission.findUnique({ where: { id: paymentId } });
    if (!payment) {
      return res.status(404).json({ error: 'Listing payment was not found.' });
    }

    const requestedBillId = String(req.body?.billId || '').trim();
    const existingBill = requestedBillId
      ? await prismaAny.listingBill.findUnique({ where: { id: requestedBillId } })
      : await prismaAny.listingBill.findUnique({
        where: { paymentId_billType: { paymentId, billType } },
      });

    if (existingBill && existingBill.paymentId !== paymentId) {
      return res.status(400).json({ error: 'The selected bill does not belong to this payment.' });
    }

    const bill = existingBill
      ? await prismaAny.listingBill.update({
        where: { id: existingBill.id },
        data: { paymentId, billType, payload },
        include: listingBillInclude,
      })
      : await prismaAny.listingBill.create({
        data: {
          paymentId,
          billType,
          payload,
          createdByUserId: req.user?.id || null,
        },
        include: listingBillInclude,
      });

    return res.status(existingBill ? 200 : 201).json({
      message: existingBill ? 'Bill updated successfully.' : 'Bill saved successfully.',
      bill: mapListingBill(bill),
    });
  } catch (error) {
    if (error instanceof Error && /valid bill type|valid invoice type|amount|GST rate|tax type/i.test(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
};

export const deleteListingBill = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'Bill id is required.' });
    }

    const bill = await prismaAny.listingBill.findUnique({ where: { id } });
    if (!bill) {
      return res.status(404).json({ error: 'Bill was not found.' });
    }

    await prismaAny.listingBill.delete({ where: { id } });
    return res.json({ message: 'Bill deleted successfully.' });
  } catch (error) {
    next(error);
  }
};
