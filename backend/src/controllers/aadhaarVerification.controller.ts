import type { NextFunction, Request, Response } from 'express';
import {
  AadhaarVerificationError,
  aadhaarVerificationService,
} from '../services/aadhaarVerification.service';
import { streamFileFromDrive } from '../services/googleDrive.service';

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

export const getAadhaarVerificationHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await aadhaarVerificationService.listHistory(req.query, req.user!.id, req.user!.role);
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

export const getAadhaarVerificationStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id || id.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid Aadhaar verification record id is required.', code: 'invalid_record_id' });
    }
    const result = await aadhaarVerificationService.checkStatus(id, req.user!.id, req.user!.role);
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
    const result = await aadhaarVerificationService.getHistoryDetail(id, req.user!.id, req.user!.role);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

const recordIdOf = (req: Request) => typeof req.params.id === 'string' ? req.params.id.trim() : '';

export const uploadAadhaarTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recordId = recordIdOf(req);
    if (!recordId || recordId.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid Aadhaar verification record id is required.', code: 'invalid_record_id' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'An Aadhaar template file is required.', code: 'template_file_required' });
    }
    const result = await aadhaarVerificationService.uploadTemplate(
      recordId,
      req.user!.id,
      req.user!.role,
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
    );
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getAadhaarTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recordId = recordIdOf(req);
    if (!recordId || recordId.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid Aadhaar verification record id is required.', code: 'invalid_record_id' });
    }
    const template = await aadhaarVerificationService.getTemplateDownload(recordId, req.user!.id, req.user!.role);
    const stream = await streamFileFromDrive(template.driveFileId);
    res.setHeader('Content-Type', template.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${template.fileName}"`);
    res.setHeader('Content-Length', String(template.fileSize));
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    stream.on('error', next);
    stream.pipe(res);
  } catch (error) {
    return sendError(error, res, next);
  }
};
