import type { NextFunction, Request, Response } from 'express';
import { GstVerificationError, gstVerificationService } from '../services/gstVerification.service';
import { PanVerificationError, panVerificationService } from '../services/panVerification.service';

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
    return res.status(result.cacheHit ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const verifyPartnerGstin = async (req: Request, res: Response, next: NextFunction) => {
  if (!ensurePartnerKycAccess(req, res)) return;

  try {
    const result = await gstVerificationService.verifyGstin(bodyOf(req.body), req.user!.id);
    return res.status(result.cacheHit ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};
