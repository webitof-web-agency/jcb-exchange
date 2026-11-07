import type { NextFunction, Request, Response } from 'express';
import { GstVerificationError } from '../services/gstVerification.service';
import { PartnerGstReverificationError, partnerGstReverificationService } from '../services/partnerGstReverification.service';

export const reverifyPartnerGstin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await partnerGstReverificationService.reverify({
      partnerUserId: String(req.params.id || ''),
      actorUserId: req.user!.id,
      gstin: req.body?.gstin,
      reason: req.body?.reason,
    });
    return res.status(201).json({ success: true, message: 'Partner GST verified and updated.', ...result });
  } catch (error) {
    if (error instanceof PartnerGstReverificationError || error instanceof GstVerificationError) {
      return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
    }
    return next(error);
  }
};
