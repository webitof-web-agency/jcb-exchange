import type { NextFunction, Request, Response } from 'express';
import { PanVerificationError, panVerificationService } from '../services/panVerification.service';

const bodyOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const sendError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof PanVerificationError) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }
  return next(error);
};

export const verifyPan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await panVerificationService.verifyPan(bodyOf(req.body), req.user!.id);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const panToAadhaar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await panVerificationService.getPanToAadhaar(bodyOf(req.body), req.user!.id);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const panToContact = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await panVerificationService.getPanToContacts(bodyOf(req.body), req.user!.id);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const panComprehensiveV2 = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await panVerificationService.getPanComprehensiveV2(bodyOf(req.body), req.user!.id);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getPanVerificationHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await panVerificationService.listHistory(req.query);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getPanVerificationDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id || id.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid PAN verification record id is required.', code: 'invalid_record_id' });
    }
    const result = await panVerificationService.getHistoryDetail(id, req.user!.id, req.user!.role);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};
