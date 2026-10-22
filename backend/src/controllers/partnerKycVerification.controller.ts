import type { NextFunction, Request, Response } from 'express';
import { GstVerificationError, gstVerificationService } from '../services/gstVerification.service';
import { PanVerificationError, panVerificationService } from '../services/panVerification.service';
import prisma from '../lib/prisma';

const bodyOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export const isPartnerKycRole = (role?: string | null) => role === 'PARTNER' || role === 'CUSTOMER';

const ensurePartnerKycAccess = (req: Request, res: Response) => {
  if (!req.user?.id || !isPartnerKycRole(req.user.role)) {
    res.status(403).json({ error: 'Partner onboarding access required.' });
    return false;
  }

  return true;
};

const sendError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof PanVerificationError || error instanceof GstVerificationError) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }

  return next(error);
};

export const verifyPartnerPan = async (req: Request, res: Response, next: NextFunction) => {
  if (!ensurePartnerKycAccess(req, res)) return;

  try {
    const result = await panVerificationService.getPanComprehensiveV2(bodyOf(req.body), req.user!.id);

    // Auto-persist verification into partner profile immediately so it is never lost on refresh
    if (result.record?.id && result.record?.status === 'SUCCESS') {
      try {
        const partnerProfile = await prisma.partnerProfile.findUnique({
          where: { userId: req.user!.id },
          select: { id: true },
        });
        if (partnerProfile) {
          const panNumber = String(req.body.id_number || '').trim().toUpperCase();
          const fullName = (result.result as any)?.panDetails?.fullName || undefined;

          const existingDoc = await prisma.kycDocument.findFirst({
            where: { partnerProfileId: partnerProfile.id, documentType: 'PAN_CARD' },
          });
          if (existingDoc) {
            await prisma.kycDocument.update({
              where: { id: existingDoc.id },
              data: {
                ...(panNumber ? { documentNumber: panNumber } : {}),
                ...(fullName ? { nameOnDocument: fullName } : {}),
                verificationRecordId: result.record.id,
                verificationStatus: 'VERIFIED',
                verificationCacheHit: result.cacheHit === true,
                verificationCompletedAt: result.record.completedAt ? new Date(result.record.completedAt) : new Date(),
                verificationMessage: null,
              },
            });
          }
        }
      } catch (persistErr) {
        console.error('Failed to auto-update KYC document after PAN verification:', persistErr);
      }
    }

    return res.status(result.cacheHit ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const verifyPartnerGstin = async (req: Request, res: Response, next: NextFunction) => {
  if (!ensurePartnerKycAccess(req, res)) return;

  try {
    const result = await gstVerificationService.verifyGstin(bodyOf(req.body), req.user!.id);

    // Auto-persist verification into partner profile immediately so it is never lost on refresh
    if (result.record?.id && result.record?.status === 'SUCCESS') {
      try {
        const partnerProfile = await prisma.partnerProfile.findUnique({
          where: { userId: req.user!.id },
          select: { id: true },
        });
        if (partnerProfile) {
          const gstinNumber = String(req.body.id_number || req.body.gstin || '').trim().toUpperCase();
          const legalName = (result.result as any)?.legalName || (result.result as any)?.businessName || undefined;

          const existingDoc = await prisma.kycDocument.findFirst({
            where: { partnerProfileId: partnerProfile.id, documentType: 'GST_CERTIFICATE' },
          });
          if (existingDoc) {
            await prisma.kycDocument.update({
              where: { id: existingDoc.id },
              data: {
                ...(gstinNumber ? { documentNumber: gstinNumber } : {}),
                ...(legalName ? { nameOnDocument: legalName } : {}),
                verificationRecordId: result.record.id,
                verificationStatus: 'VERIFIED',
                verificationCacheHit: result.cacheHit === true,
                verificationCompletedAt: result.record.completedAt ? new Date(result.record.completedAt) : new Date(),
                verificationMessage: null,
              },
            });
          }
        }
      } catch (persistErr) {
        console.error('Failed to auto-update KYC document after GST verification:', persistErr);
      }
    }

    return res.status(result.cacheHit ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};
