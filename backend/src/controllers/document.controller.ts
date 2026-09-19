import { NextFunction, Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import {
  getPublicDocumentUrl,
  getPublicFinanceSupportImageUrl,
  getPublicInspectionSectionImageUrl,
  getPublicListingMediaUrl,
  getPublicSiteManifestIconUrl,
  getPublicSiteFaviconUrl,
  getPublicSiteLogoUrl,
  getPublicSiteDarkLogoUrl,
  getSecureDocumentUrl,
  MAX_FINANCE_SUPPORT_IMAGE_UPLOAD_SIZE,
  MAX_HERO_IMAGE_UPLOAD_SIZE,
  MAX_INSPECTION_SECTION_IMAGE_UPLOAD_SIZE,
  MAX_SITE_LOGO_IMAGE_UPLOAD_SIZE,
  MAX_SITE_FAVICON_IMAGE_UPLOAD_SIZE,
  MAX_SITE_MANIFEST_ICON_IMAGE_UPLOAD_SIZE,
  isPdfMimeType,
  isVideoMimeType,
  MAX_DOCUMENT_UPLOAD_SIZE,
  MAX_LISTING_VIDEO_UPLOAD_SIZE,
  secureUploadDir,
  getPublicHeroImageUrl,
} from '../utils/documentUpload';
import { uploadFileToDrive } from '../services/googleDrive.service';

const prismaAny = prisma as any;

const getApiOrigin = (req: Request) => `${req.protocol}://${req.get('host')}`;

const getUploadedFile = (req: Request) => req.file;

const cleanupFile = async (filePath?: string) => {
  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore cleanup failures for already-missing temp files.
  }
};

const enforceStoredFileSizePolicy = async (
  file: Express.Multer.File,
  purpose: 'document' | 'listing-media' | 'finance-support' | 'hero-image' | 'inspection-section' | 'site-logo' | 'site-dark-logo' | 'site-favicon' | 'site-manifest-icon' = 'document'
) => {
  if (isPdfMimeType(file.mimetype) && file.size > 3 * 1024 * 1024) {
    await cleanupFile(file.path);
    throw new Error('PDF files must be 3MB or smaller.');
  }

  if (purpose === 'document' && !isPdfMimeType(file.mimetype) && file.size > MAX_DOCUMENT_UPLOAD_SIZE) {
    await cleanupFile(file.path);
    throw new Error('Image files must be 5MB or smaller.');
  }

  if (purpose === 'listing-media') {
    if (isVideoMimeType(file.mimetype) && file.size > MAX_LISTING_VIDEO_UPLOAD_SIZE) {
      await cleanupFile(file.path);
      throw new Error('Video files must be 15MB or smaller.');
    }

    if (!isVideoMimeType(file.mimetype) && file.size > MAX_DOCUMENT_UPLOAD_SIZE) {
      await cleanupFile(file.path);
      throw new Error('Image files must be 5MB or smaller.');
    }
  }

  if (purpose === 'finance-support' && file.size > MAX_FINANCE_SUPPORT_IMAGE_UPLOAD_SIZE) {
    await cleanupFile(file.path);
    throw new Error('Finance support logo image must be 2MB or smaller.');
  }

  if (purpose === 'hero-image' && file.size > MAX_HERO_IMAGE_UPLOAD_SIZE) {
    await cleanupFile(file.path);
    throw new Error('Hero image must be 5MB or smaller.');
  }

  if (purpose === 'inspection-section' && file.size > MAX_INSPECTION_SECTION_IMAGE_UPLOAD_SIZE) {
    await cleanupFile(file.path);
    throw new Error('Inspection section image must be 5MB or smaller.');
  }

  if (purpose === 'site-logo' && file.size > MAX_SITE_LOGO_IMAGE_UPLOAD_SIZE) {
    await cleanupFile(file.path);
    throw new Error('Site logo image must be 2MB or smaller.');
  }

  if (purpose === 'site-dark-logo' && file.size > MAX_SITE_LOGO_IMAGE_UPLOAD_SIZE) {
    await cleanupFile(file.path);
    throw new Error('Dark logo image must be 2MB or smaller.');
  }

  if (purpose === 'site-favicon' && file.size > MAX_SITE_FAVICON_IMAGE_UPLOAD_SIZE) {
    await cleanupFile(file.path);
    throw new Error('Favicon image must be 512KB or smaller.');
  }

  if (purpose === 'site-manifest-icon' && file.size > MAX_SITE_MANIFEST_ICON_IMAGE_UPLOAD_SIZE) {
    await cleanupFile(file.path);
    throw new Error('Manifest icon image must be 1MB or smaller.');
  }
};

const getSafeFileName = (fileName: string) => path.basename(fileName);

const isSecureDocumentOwner = async (userId: string, fileUrl: string) => {
  const matchingDocument = await prismaAny.kycDocument.findFirst({
    where: {
      fileUrl,
      partnerProfile: {
        userId,
      },
    },
    select: { id: true },
  });

  if (matchingDocument) {
    return true;
  }

  return false;
};

const secureDocumentExists = async (fileUrl: string) => {
  const [kycDocument, candidateDocument] = await Promise.all([
    prismaAny.kycDocument.findFirst({
      where: { fileUrl },
      select: { id: true },
    }),
    prismaAny.candidateDocument.findFirst({
      where: { fileUrl },
      select: { id: true },
    }),
  ]);

  return Boolean(kycDocument || candidateDocument);
};

const buildUploadResponse = (
  req: Request,
  file: Express.Multer.File,
  visibility: 'public' | 'secure',
  fileUrl: string,
  fileName: string
) => {
  return {
    message: 'File uploaded successfully.',
    file: {
      access: visibility,
      fileName: fileName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      fileUrl,
      absoluteUrl: fileUrl, // Drive URL is already absolute
    },
  };
};

export const uploadSecureDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = getUploadedFile(req);

    if (!file) {
      return res.status(400).json({ error: 'A file is required.' });
    }

    await enforceStoredFileSizePolicy(file, 'document');
    
    // Upload to Google Drive (Resumes/Secure)
    const { fileId, viewLink } = await uploadFileToDrive(file.buffer, file.mimetype, file.originalname);
    
    res.status(201).json(buildUploadResponse(req, file, 'secure', viewLink, fileId));
  } catch (error) {
    next(error);
  }
};

export const uploadPublicDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = getUploadedFile(req);

    if (!file) {
      return res.status(400).json({ error: 'A file is required.' });
    }

    await enforceStoredFileSizePolicy(file, 'document');
    
    // Upload to Google Drive (Public)
    const { fileId, viewLink } = await uploadFileToDrive(file.buffer, file.mimetype, file.originalname);
    
    res.status(201).json(buildUploadResponse(req, file, 'public', viewLink, fileId));
  } catch (error) {
    next(error);
  }
};

export const uploadCustomerPrimeReceipt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ error: 'Prime receipt upload is available for customers only.' });
    }

    const file = getUploadedFile(req);

    if (!file) {
      return res.status(400).json({ error: 'A receipt file is required.' });
    }

    await enforceStoredFileSizePolicy(file, 'document');
    const { fileId, viewLink } = await uploadFileToDrive(file.buffer, file.mimetype, file.originalname);
    res.status(201).json(buildUploadResponse(req, file, 'public', viewLink, fileId));
  } catch (error) {
    next(error);
  }
};

export const uploadListingPaymentReceipt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ error: 'Listing payment receipt upload is available for customers only.' });
    }

    const file = getUploadedFile(req);

    if (!file) {
      return res.status(400).json({ error: 'A receipt file is required.' });
    }

    await enforceStoredFileSizePolicy(file, 'document');
    const { fileId, viewLink } = await uploadFileToDrive(file.buffer, file.mimetype, file.originalname);
    res.status(201).json(buildUploadResponse(req, file, 'public', viewLink, fileId));
  } catch (error) {
    next(error);
  }
};

export const uploadPublicListingMedia = async (req: Request, res: Response, next: NextFunction) => {
  const file = getUploadedFile(req);

  try {
    if (!file) {
      return res.status(400).json({ error: 'A file is required.' });
    }

    await enforceStoredFileSizePolicy(file, 'listing-media');

    const { fileId, viewLink } = await uploadFileToDrive(file.buffer, file.mimetype, file.originalname);
    res.status(201).json(buildUploadResponse(req, file, 'public', viewLink, fileId));

  } catch (error) {
    await cleanupFile(file?.path);
    next(error);
  }
};

export const uploadPublicFinanceSupportImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = getUploadedFile(req);

    if (!file) {
      return res.status(400).json({ error: 'A file is required.' });
    }

    await enforceStoredFileSizePolicy(file, 'finance-support');
    const { fileId, viewLink } = await uploadFileToDrive(file.buffer, file.mimetype, file.originalname);
    res.status(201).json(buildUploadResponse(req, file, 'public', viewLink, fileId));
  } catch (error) {
    next(error);
  }
};

export const uploadPublicHeroImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = getUploadedFile(req);

    if (!file) {
      return res.status(400).json({ error: 'A file is required.' });
    }

    await enforceStoredFileSizePolicy(file, 'hero-image');
    const { fileId, viewLink } = await uploadFileToDrive(file.buffer, file.mimetype, file.originalname);
    res.status(201).json(buildUploadResponse(req, file, 'public', viewLink, fileId));
  } catch (error) {
    next(error);
  }
};

export const uploadPublicInspectionSectionImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = getUploadedFile(req);

    if (!file) {
      return res.status(400).json({ error: 'A file is required.' });
    }

    await enforceStoredFileSizePolicy(file, 'inspection-section');
    const { fileId, viewLink } = await uploadFileToDrive(file.buffer, file.mimetype, file.originalname);
    res.status(201).json(buildUploadResponse(req, file, 'public', viewLink, fileId));
  } catch (error) {
    next(error);
  }
};

export const uploadPublicSiteLogoImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = getUploadedFile(req);

    if (!file) {
      return res.status(400).json({ error: 'A file is required.' });
    }

    await enforceStoredFileSizePolicy(file, 'site-logo');
    const { fileId, viewLink } = await uploadFileToDrive(file.buffer, file.mimetype, file.originalname);
    res.status(201).json(buildUploadResponse(req, file, 'public', viewLink, fileId));
  } catch (error) {
    next(error);
  }
};

export const uploadPublicSiteDarkLogoImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = getUploadedFile(req);

    if (!file) {
      return res.status(400).json({ error: 'A file is required.' });
    }

    await enforceStoredFileSizePolicy(file, 'site-dark-logo');
    const { fileId, viewLink } = await uploadFileToDrive(file.buffer, file.mimetype, file.originalname);
    res.status(201).json(buildUploadResponse(req, file, 'public', viewLink, fileId));
  } catch (error) {
    next(error);
  }
};

export const uploadPublicSiteFaviconImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = getUploadedFile(req);

    if (!file) {
      return res.status(400).json({ error: 'A file is required.' });
    }

    await enforceStoredFileSizePolicy(file, 'site-favicon');
    const { fileId, viewLink } = await uploadFileToDrive(file.buffer, file.mimetype, file.originalname);
    res.status(201).json(buildUploadResponse(req, file, 'public', viewLink, fileId));
  } catch (error) {
    next(error);
  }
};

export const uploadPublicSiteManifestIconImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = getUploadedFile(req);

    if (!file) {
      return res.status(400).json({ error: 'A file is required.' });
    }

    await enforceStoredFileSizePolicy(file, 'site-manifest-icon');
    const { fileId, viewLink } = await uploadFileToDrive(file.buffer, file.mimetype, file.originalname);
    res.status(201).json(buildUploadResponse(req, file, 'public', viewLink, fileId));
  } catch (error) {
    next(error);
  }
};

export const getSecureDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const fileName = getSafeFileName(String(req.params.filename || ''));
    if (!fileName) {
      return res.status(400).json({ error: 'Invalid filename.' });
    }

    const fileUrl = getSecureDocumentUrl(fileName);
    const fileExistsInRecords = await secureDocumentExists(fileUrl);

    if (!fileExistsInRecords) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const isStaffOperator = ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(req.user.role);
    const hasAccess = isStaffOperator || (await isSecureDocumentOwner(req.user.id, fileUrl));

    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this document.' });
    }

    const absolutePath = path.join(secureUploadDir, fileName);
    await fs.access(absolutePath);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
};
