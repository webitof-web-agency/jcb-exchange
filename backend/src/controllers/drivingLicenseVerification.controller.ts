import type { NextFunction, Request, Response } from 'express';
import { DrivingLicenseVerificationError, drivingLicenseVerificationService } from '../services/drivingLicenseVerification.service';

const bodyOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const sendError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof DrivingLicenseVerificationError) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }
  return next(error);
};

export const verifyDrivingLicense = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await drivingLicenseVerificationService.verifyDrivingLicense(bodyOf(req.body), req.user!.id);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getDrivingLicenseVerificationHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await drivingLicenseVerificationService.listHistory(req.query);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getDrivingLicenseVerificationDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id || id.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid driving license verification record id is required.', code: 'invalid_record_id' });
    }
    const result = await drivingLicenseVerificationService.getHistoryDetail(id);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};
