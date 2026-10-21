import type { NextFunction, Request, Response } from 'express';
import {
  ChassisToRcVerificationError,
  chassisToRcVerificationService,
} from '../services/chassisToRcVerification.service';

const bodyOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const sellerResultFields = new Set([
  'rcNumber',
  'ownerName',
  'registrationDate',
  'registrationUpto',
  'vehicleCategory',
  'vehicleCategoryDescription',
  'vehicleChasiNumber',
  'vehicleEngineNumber',
  'makerDescription',
  'makerModel',
  'fuelType',
  'variant',
  'manufacturingDate',
  'manufacturingDateFormatted',
  'fitUpTo',
  'insuranceUpto',
  'taxUpto',
  'taxPaidUpto',
  'puccUpto',
  'ownerNumber',
  'financer',
  'registeredAt',
  'financed',
]);

export const sanitizeChassisToRcResultForSeller = (value: unknown) => {
  const result = bodyOf(value);
  return Object.fromEntries(
    Object.entries(result).filter(([key]) => sellerResultFields.has(key)),
  );
};

const sendError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof ChassisToRcVerificationError) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }
  return next(error);
};

export const verifyChassisToRc = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await chassisToRcVerificationService.verifyChassisToRc(bodyOf(req.body), req.user!.id);
    const isSeller = req.user?.role === 'CUSTOMER' || req.user?.role === 'PARTNER';
    const billing = 'billing' in result ? result.billing : undefined;
    return res.status(201).json({
      success: true,
      record: isSeller ? { id: result.record.id, status: result.record.status } : result.record,
      cacheHit: result.cacheHit,
      ...(billing && !isSeller ? { billing } : {}),
      ...(isSeller ? { result: sanitizeChassisToRcResultForSeller(result.result) } : {}),
      ...(!isSeller ? { result: result.result } : {}),
    });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getChassisToRcHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await chassisToRcVerificationService.listHistory(req.query);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getChassisToRcHistoryDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id || id.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid chassis-to-RC history record id is required.', code: 'invalid_record_id' });
    }
    const result = await chassisToRcVerificationService.getHistoryDetail(id);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};
