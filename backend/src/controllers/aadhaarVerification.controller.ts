import type { NextFunction, Request, Response } from 'express';
import {
  AadhaarVerificationError,
  aadhaarVerificationService,
} from '../services/aadhaarVerification.service';

const bodyOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const sendError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof AadhaarVerificationError) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }
  return next(error);
};

export const initializeAadhaarVerification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = bodyOf(req.body);
    const result = await aadhaarVerificationService.initialize({
      aadhaarNumber: body.aadhaarNumber ?? body.aadhaar_number,
      side: body.side,
    }, req.user!.id);
    return res.status(result.cacheHit ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const completeAadhaarVerification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = bodyOf(req.body);
    const result = await aadhaarVerificationService.complete({
      recordId: body.recordId ?? body.record_id,
      clientId: body.clientId ?? body.client_id,
    }, req.user!.id);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const cancelAadhaarVerification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = bodyOf(req.body);
    const result = await aadhaarVerificationService.cancel(body.recordId ?? body.record_id, req.user!.id);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getAadhaarVerificationDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id || id.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid Aadhaar verification record id is required.', code: 'invalid_record_id' });
    }
    const result = await aadhaarVerificationService.getHistoryDetail(id, req.user!.id);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};
