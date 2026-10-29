import type { NextFunction, Request, Response } from 'express';
import {
  AadhaarVerificationError,
  aadhaarVerificationService,
} from '../services/aadhaarVerification.service';
import { GstVerificationError, gstVerificationService } from '../services/gstVerification.service';
import { PanVerificationError, panVerificationService } from '../services/panVerification.service';
import { streamFileFromDrive } from '../services/googleDrive.service';
import prisma from '../lib/prisma';

const bodyOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export const isPartnerKycRole = (role?: string | null) => role === 'PARTNER' || role === 'CUSTOMER';

const ensurePartnerKycAccess = (req: Request, res: Response) => {
  if (!req.user?.id || !isPartnerKycRole(req.user.role)) {
    res.status(403).json({ error: 'Partner onboarding access required.' });
    return false;
  }

  return true;
};

const sendError = (error: unknown, res: Response, next: NextFunction) => {
  if (
    error instanceof AadhaarVerificationError ||
    error instanceof PanVerificationError ||
    error instanceof GstVerificationError
  ) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }

  return next(error);
};

type PartnerTemplateType = 'PAN_CARD' | 'GST_CERTIFICATE' | 'AADHAAR_CARD';
const PARTNER_TEMPLATE_TYPES = new Set<PartnerTemplateType>(['PAN_CARD', 'GST_CERTIFICATE', 'AADHAAR_CARD']);

const partnerTemplateTypeOf = (value: unknown): PartnerTemplateType | null => {
  const documentType = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return PARTNER_TEMPLATE_TYPES.has(documentType as PartnerTemplateType) ? documentType as PartnerTemplateType : null;
};

const normalizePartnerDocumentNumber = (value: unknown) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, '').toUpperCase() : '';

const persistPartnerVerificationDocument = async ({
  userId,
  documentType,
  recordId,
  documentNumber,
  nameOnDocument,
  templateSaved,
  completedAt,
}: {
  userId: string;
  documentType: PartnerTemplateType;
  recordId: string;
  documentNumber?: unknown;
  nameOnDocument?: unknown;
  templateSaved: boolean;
  completedAt?: unknown;
}) => {
  const partnerProfile = await prisma.partnerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!partnerProfile) return null;

  const existing = await prisma.kycDocument.findFirst({
    where: { partnerProfileId: partnerProfile.id, documentType },
    select: { id: true },
  });
  const number = normalizePartnerDocumentNumber(documentNumber);
  const name = typeof nameOnDocument === 'string' && nameOnDocument.trim()
    ? nameOnDocument.trim()
    : undefined;
  const completed = completedAt ? new Date(String(completedAt)) : new Date();
  const safeCompletedAt = Number.isNaN(completed.getTime()) ? new Date() : completed;
  const data = {
    fileUrl: null,
    fileName: null,
    ...(number ? { documentNumber: number } : {}),
    ...(name ? { nameOnDocument: name } : {}),
    verificationRecordId: recordId,
    verificationStatus: 'VERIFIED',
    verificationCacheHit: false,
    verificationCompletedAt: safeCompletedAt,
    verificationMessage: null,
    status: templateSaved ? 'UPLOADED' : 'NOT_UPLOADED',
  } as const;

  if (existing) {
    return prisma.kycDocument.update({ where: { id: existing.id }, data });
  }

  return prisma.kycDocument.create({
    data: {
      partnerProfileId: partnerProfile.id,
      documentType,
      ...data,
    },
  });
};

const getTemplateService = (documentType: PartnerTemplateType) => {
  if (documentType === 'PAN_CARD') return panVerificationService;
  if (documentType === 'GST_CERTIFICATE') return gstVerificationService;
  return aadhaarVerificationService;
};

export const initializePartnerAadhaar = async (req: Request, res: Response, next: NextFunction) => {
  if (!ensurePartnerKycAccess(req, res)) return;

  try {
    const body = bodyOf(req.body);
    const result = await aadhaarVerificationService.initialize({
      aadhaarNumber: body.aadhaarNumber ?? body.aadhaar_number,
      side: 'SALE',
    }, req.user!.id);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const completePartnerAadhaar = async (req: Request, res: Response, next: NextFunction) => {
  if (!ensurePartnerKycAccess(req, res)) return;

  try {
    const body = bodyOf(req.body);
    const result = await aadhaarVerificationService.complete({
      recordId: body.recordId ?? body.record_id,
      clientId: body.clientId ?? body.client_id,
    }, req.user!.id);
    if (result.record?.id && result.record.status === 'SUCCESS') {
      await persistPartnerVerificationDocument({
        userId: req.user!.id,
        documentType: 'AADHAAR_CARD',
        recordId: result.record.id,
        documentNumber: (result.result as Record<string, unknown> | null)?.aadhaarNumber,
        nameOnDocument: (result.result as Record<string, unknown> | null)?.fullName,
        templateSaved: Boolean(result.template),
        completedAt: result.record.completedAt,
      });
    }
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const cancelPartnerAadhaar = async (req: Request, res: Response, next: NextFunction) => {
  if (!ensurePartnerKycAccess(req, res)) return;

  try {
    const body = bodyOf(req.body);
    const result = await aadhaarVerificationService.cancel(body.recordId ?? body.record_id, req.user!.id);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getPartnerAadhaarStatus = async (req: Request, res: Response, next: NextFunction) => {
  if (!ensurePartnerKycAccess(req, res)) return;

  try {
    const recordId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!recordId || recordId.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid Aadhaar verification record id is required.', code: 'invalid_record_id' });
    }
    const result = await aadhaarVerificationService.checkStatus(recordId, req.user!.id, req.user!.role);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const uploadPartnerKycTemplate = async (req: Request, res: Response, next: NextFunction) => {
  if (!ensurePartnerKycAccess(req, res)) return;

  try {
    const documentType = partnerTemplateTypeOf(req.params.documentType);
    const recordId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!documentType || !recordId || recordId.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid KYC template record is required.', code: 'invalid_template_record' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'A generated KYC template is required.', code: 'template_file_required' });
    }

    const service = getTemplateService(documentType);
    const result = documentType === 'AADHAAR_CARD'
      ? await service.uploadTemplate(recordId, req.user!.id, req.user!.role, req.file.buffer, req.file.mimetype, req.file.originalname)
      : await service.uploadTemplate(recordId, req.user!.id, req.user!.role, req.file.buffer, req.file.mimetype);
    const persistedDocument = await persistPartnerVerificationDocument({
      userId: req.user!.id,
      documentType,
      recordId,
      documentNumber: bodyOf(req.body).documentNumber,
      nameOnDocument: bodyOf(req.body).nameOnDocument,
      templateSaved: true,
      completedAt: result.record?.completedAt,
    });

    return res.status(201).json({ success: true, ...result, kycDocumentId: persistedDocument?.id || null });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const getPartnerKycTemplate = async (req: Request, res: Response, next: NextFunction) => {
  if (!ensurePartnerKycAccess(req, res)) return;

  try {
    const documentType = partnerTemplateTypeOf(req.params.documentType);
    const recordId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!documentType || !recordId || recordId.length > 100) {
      return res.status(400).json({ success: false, error: 'A valid KYC template record is required.', code: 'invalid_template_record' });
    }
    const service = getTemplateService(documentType);
    const template = await service.getTemplateDownload(recordId, req.user!.id, req.user!.role);
    const stream = await streamFileFromDrive(template.driveFileId);
    res.setHeader('Content-Type', template.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${template.fileName}"`);
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

export const verifyPartnerPan = async (req: Request, res: Response, next: NextFunction) => {
  if (!ensurePartnerKycAccess(req, res)) return;

  try {
    const result = await panVerificationService.getPanComprehensiveV2(bodyOf(req.body), req.user!.id);

    // Auto-persist verification into partner profile immediately so it is never lost on refresh
    if (result.record?.id && result.record?.status === 'SUCCESS') {
      try {
        const partnerProfile = await prisma.partnerProfile.findUnique({
          where: { userId: req.user!.id },
          select: { id: true },
        });
        if (partnerProfile) {
          const panNumber = String(req.body.id_number || '').trim().toUpperCase();
          const fullName = (result.result as any)?.panDetails?.fullName || undefined;

          const existingDoc = await prisma.kycDocument.findFirst({
            where: { partnerProfileId: partnerProfile.id, documentType: 'PAN_CARD' },
          });
          if (existingDoc) {
            await prisma.kycDocument.update({
              where: { id: existingDoc.id },
              data: {
                ...(panNumber ? { documentNumber: panNumber } : {}),
                ...(fullName ? { nameOnDocument: fullName } : {}),
                verificationRecordId: result.record.id,
                verificationStatus: 'VERIFIED',
                verificationCacheHit: result.cacheHit === true,
                verificationCompletedAt: result.record.completedAt ? new Date(result.record.completedAt) : new Date(),
                verificationMessage: null,
              },
            });
          }
        }
      } catch (persistErr) {
        console.error('Failed to auto-update KYC document after PAN verification:', persistErr);
      }
    }

    return res.status(result.cacheHit ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};

export const verifyPartnerGstin = async (req: Request, res: Response, next: NextFunction) => {
  if (!ensurePartnerKycAccess(req, res)) return;

  try {
    const result = await gstVerificationService.verifyGstin(bodyOf(req.body), req.user!.id);

    // Auto-persist verification into partner profile immediately so it is never lost on refresh
    if (result.record?.id && result.record?.status === 'SUCCESS') {
      try {
        const partnerProfile = await prisma.partnerProfile.findUnique({
          where: { userId: req.user!.id },
          select: { id: true },
        });
        if (partnerProfile) {
          const gstinNumber = String(req.body.id_number || req.body.gstin || '').trim().toUpperCase();
          const legalName = (result.result as any)?.legalName || (result.result as any)?.businessName || undefined;

          const existingDoc = await prisma.kycDocument.findFirst({
            where: { partnerProfileId: partnerProfile.id, documentType: 'GST_CERTIFICATE' },
          });
          if (existingDoc) {
            await prisma.kycDocument.update({
              where: { id: existingDoc.id },
              data: {
                ...(gstinNumber ? { documentNumber: gstinNumber } : {}),
                ...(legalName ? { nameOnDocument: legalName } : {}),
                verificationRecordId: result.record.id,
                verificationStatus: 'VERIFIED',
                verificationCacheHit: result.cacheHit === true,
                verificationCompletedAt: result.record.completedAt ? new Date(result.record.completedAt) : new Date(),
                verificationMessage: null,
              },
            });
          }
        }
      } catch (persistErr) {
        console.error('Failed to auto-update KYC document after GST verification:', persistErr);
      }
    }

    return res.status(result.cacheHit ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    return sendError(error, res, next);
  }
};
