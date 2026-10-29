import type { NextFunction, Request, Response } from 'express';
import {
  RcOwnerHistoryError,
  normalizeRcOwnerHistoryResult,
  rcFullService,
  sanitizeRcFullResultForListing,
} from '../services/rcOwnerHistory.service';
import { normalizeRcNumber } from '../services/rcOwnerHistory.validation';
import { getAppSettings } from '../utils/appSettings';
import { isVehicleListingVerificationEnabled } from '../utils/listingVerificationPolicy';

const bodyOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const sendError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof RcOwnerHistoryError) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }
  return next(error);
};

const listingVerificationRoles = new Set(['CUSTOMER', 'PARTNER', 'EMPLOYEE', 'ADMIN', 'SUPER_ADMIN']);

export const verifyRcFullForListing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.role || !listingVerificationRoles.has(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Listing vehicle verification is not available for this account.', code: 'listing_verification_forbidden' });
    }

    const settings = await getAppSettings();
    if (!isVehicleListingVerificationEnabled(settings.vehicleListingVerification, 'RC_FULL')) {
      return res.status(403).json({
        success: false,
        error: 'Vehicle number verification is currently disabled for listings.',
        code: 'listing_verification_disabled',
      });
    }

    const result = await rcFullService.verifyRc(bodyOf(req.body), req.user.id);
    const requestedRegistration = normalizeRcNumber(
      bodyOf(req.body).id_number ?? bodyOf(req.body).rc_number ?? bodyOf(req.body).rcNumber,
    );
    const normalizedResult = normalizeRcOwnerHistoryResult(result.result);
    const returnedRegistration = normalizeRcNumber(normalizedResult.rcNumber);
    if (!requestedRegistration || returnedRegistration !== requestedRegistration) {
      throw new RcOwnerHistoryError(
        'The verified vehicle number does not match the entered vehicle number.',
        422,
        'provider_identity_mismatch',
      );
    }

    return res.status(201).json({
      success: true,
      record: { id: result.record.id, status: result.record.status },
      cacheHit: result.cacheHit,
      result: sanitizeRcFullResultForListing(normalizedResult),
    });
  } catch (error) {
    return sendError(error, res, next);
  }
};

