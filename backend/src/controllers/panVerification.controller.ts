import type { NextFunction, Request, Response } from 'express';
import { PanVerificationError, panVerificationService } from '../services/panVerification.service';
import { streamFileFromDrive } from '../services/googleDrive.service';

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

const recordIdOf = (req: Request) => typeof req.params.id === 'string' ? req.params.id.trim() : '';

export const uploadPanTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recordId = recordIdOf(req);
    if (!recordId || recordId.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid PAN verification record id is required.', code: 'invalid_record_id' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'A PAN template file is required.', code: 'template_file_required' });
    }
    const result = await panVerificationService.uploadTemplate(
      recordId,
      req.user!.id,
      req.user!.role,
      req.file.buffer,
      req.file.mimetype,
    );
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getPanTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recordId = recordIdOf(req);
    if (!recordId || recordId.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid PAN verification record id is required.', code: 'invalid_record_id' });
    }
    const template = await panVerificationService.getTemplateDownload(recordId, req.user!.id, req.user!.role);
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
export const getPanVerificationHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await panVerificationService.listHistory(req.query, req.user!.id, req.user!.role);
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
