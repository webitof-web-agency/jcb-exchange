import type { NextFunction, Request, Response } from 'express';
import { RcOwnerHistoryError, rcOwnerHistoryService } from '../services/rcOwnerHistory.service';
import { getDriveFileBuffer } from '../services/googleDrive.service';

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
    const buffer = await getDriveFileBuffer(template.driveFileId, 25_000);
    res.setHeader('Content-Type', template.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${template.fileName}"`);
    res.setHeader('Content-Length', String(buffer.length));
    // The template is already access-controlled by this route. A short private
    // browser cache avoids downloading the same Drive file on every history view.
    res.setHeader('Cache-Control', 'private, max-age=300, must-revalidate');
    if (template.sha256) res.setHeader('ETag', `"${template.sha256}"`);
    if (template.createdAt) res.setHeader('Last-Modified', new Date(template.createdAt).toUTCString());
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.end(buffer);
  } catch (error) {
    return sendError(error, res, next);
  }
};
