import type { NextFunction, Request, Response } from 'express';
import { RcMobileNumberCheckError, rcMobileNumberCheckService } from '../services/rcMobileNumberCheck.service';

const bodyOf = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const sendError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof RcMobileNumberCheckError) return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  return next(error);
};

export const checkRcMobileNumber = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rcMobileNumberCheckService.checkRcMobileNumber(bodyOf(req.body), req.user!.id);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getRcMobileNumberCheckHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rcMobileNumberCheckService.listHistory(req.query);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getRcMobileNumberCheckHistoryDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id || id.length > 100) return res.status(400).json({ success: false, error: 'A valid RC Mobile Number Check history record id is required.', code: 'invalid_record_id' });
    const result = await rcMobileNumberCheckService.getHistoryDetail(id);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};
