import type { NextFunction, Request, Response } from 'express';
import { GstVerificationError } from '../services/gstVerification.service';
import { partnerSignupGstVerificationService } from '../services/partnerSignupGstVerification.service';
import { isPartnerSignupGloballyEnabled } from '../utils/partnerSignupRollout';

const bodyOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export const verifyPartnerSignupGstin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isPartnerSignupGloballyEnabled()) {
      return res.status(503).json({
        success: false,
        error: 'Partner registration is temporarily unavailable. Please try again later.',
        code: 'PARTNER_SIGNUP_TEMPORARILY_DISABLED',
      });
    }
    const result = await partnerSignupGstVerificationService.verifySignupGstin(bodyOf(req.body));
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof GstVerificationError) {
      return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
    }
    return next(error);
  }
};
