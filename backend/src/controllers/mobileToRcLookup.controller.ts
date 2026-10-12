import type { NextFunction, Request, Response } from 'express';
import {
  MobileToRcLookupError,
  mobileToRcLookupService,
} from '../services/mobileToRcLookup.service';

const bodyOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const sendError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof MobileToRcLookupError) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }
  return next(error);
};

export const lookupMobileToRc = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await mobileToRcLookupService.lookupMobileToRc(bodyOf(req.body), req.user!.id);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getMobileToRcHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await mobileToRcLookupService.listHistory(req.query);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getMobileToRcHistoryDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id || id.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid Mobile To RC history record id is required.', code: 'invalid_record_id' });
    }
    const result = await mobileToRcLookupService.getHistoryDetail(id);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};
