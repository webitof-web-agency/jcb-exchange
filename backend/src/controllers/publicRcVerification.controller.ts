import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyRcPublicVerificationToken } from '../utils/rcPublicVerification';

export const getPublicRcVerification = async (req: Request, res: Response) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
  const recordId = token ? verifyRcPublicVerificationToken(token) : null;
  if (!recordId) return res.status(404).json({ success: false, error: 'This RC verification link is invalid.' });

  const record = await prisma.rcOwnerHistoryRecord.findUnique({
    where: { id: recordId },
    select: {
      status: true,
      maskedRcNumber: true,
      ownerName: true,
      rcStatus: true,
      vehicleCategory: true,
      registrationDate: true,
      completedAt: true,
    },
  });

  if (!record || record.status !== 'SUCCESS') {
    return res.status(404).json({ success: false, error: 'This RC verification record is unavailable.' });
  }

  return res.json({
    success: true,
    verification: {
      verified: true,
      maskedRcNumber: record.maskedRcNumber,
      ownerName: record.ownerName,
      rcStatus: record.rcStatus,
      vehicleCategory: record.vehicleCategory,
      registrationDate: record.registrationDate,
      completedAt: record.completedAt,
    },
  });
};
