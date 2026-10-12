import type { NextFunction, Request, Response } from 'express';
import {
  RcToMobileVerificationError,
  rcToMobileVerificationService,
} from '../services/rcToMobileVerification.service';

const bodyOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const sendError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof RcToMobileVerificationError) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }
  return next(error);
};

export const verifyRcToMobile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rcToMobileVerificationService.verifyRcToMobile(bodyOf(req.body), req.user!.id);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getRcToMobileHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rcToMobileVerificationService.listHistory(req.query);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getRcToMobileHistoryDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id || id.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid RC mobile history record id is required.', code: 'invalid_record_id' });
    }
    const result = await rcToMobileVerificationService.getHistoryDetail(id);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};
