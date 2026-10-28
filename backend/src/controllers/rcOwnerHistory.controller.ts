import type { NextFunction, Request, Response } from 'express';
import { RcOwnerHistoryError, rcOwnerHistoryService } from '../services/rcOwnerHistory.service';
import { streamFileFromDrive } from '../services/googleDrive.service';

const bodyOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const sendError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof RcOwnerHistoryError) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }
  return next(error);
};

export const verifyRcOwnerHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rcOwnerHistoryService.verifyRc(bodyOf(req.body), req.user!.id);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getRcOwnerHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rcOwnerHistoryService.listHistory(req.query);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getRcOwnerHistoryDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id || id.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid RC owner history record id is required.', code: 'invalid_record_id' });
    }
    const result = await rcOwnerHistoryService.getHistoryDetail(id);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

const recordIdOf = (req: Request) => typeof req.params.id === 'string' ? req.params.id.trim() : '';

export const uploadRcOwnerHistoryTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recordId = recordIdOf(req);
    if (!recordId || recordId.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid RC owner history record id is required.', code: 'invalid_record_id' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'An RC owner-history template file is required.', code: 'template_file_required' });
    }
    const result = await rcOwnerHistoryService.uploadTemplate(
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

export const getRcOwnerHistoryTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recordId = recordIdOf(req);
    if (!recordId || recordId.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid RC owner history record id is required.', code: 'invalid_record_id' });
    }
    const template = await rcOwnerHistoryService.getTemplateDownload(recordId, req.user!.id, req.user!.role);
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
