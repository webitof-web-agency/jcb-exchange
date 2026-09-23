import { NextFunction, Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import {
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
} from '../utils/documentUpload';
import { uploadFileToDrive, extractDriveFileId, streamFileFromDrive } from '../services/googleDrive.service';
import { getAppSettings } from '../utils/appSettings';
import { getSecureDocumentUrlFromToken } from '../utils/secureDocumentUrl';

const uploadPublicBrandingImageToDrive = async (
  req: Request,
  file: Express.Multer.File,
  purpose: 'finance-support' | 'hero-image' | 'inspection-section' | 'site-logo' | 'site-dark-logo' | 'site-favicon' | 'site-manifest-icon',
) => {
  await enforceStoredFileSizePolicy(file, purpose);

  const { fileId, viewLink } = await uploadFileToDrive(
    file.buffer,
    file.mimetype,
    file.originalname,
  );

  return buildUploadResponse(req, file, 'public', viewLink, fileId);
};

const prismaAny = prisma as any;

const getApiOrigin = (req: Request) => {
  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProtocol || req.protocol;
  return `${protocol}://${req.get('host')}`;
};

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

const getDocumentUrlCandidates = (fileUrl: string) => {
  const driveFileId = extractDriveFileId(fileUrl);
  return [
    fileUrl,
    driveFileId ? `https://drive.google.com/uc?id=${encodeURIComponent(driveFileId)}` : null,
  ].filter((value): value is string => Boolean(value));
};

const isSecureDocumentOwner = async (userId: string, fileUrl: string) => {
  const matchingDocument = await prismaAny.kycDocument.findFirst({
    where: {
      fileUrl: { in: getDocumentUrlCandidates(fileUrl) },
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
  const fileUrlCandidates = getDocumentUrlCandidates(fileUrl);
  const [kycDocument, candidateDocument] = await Promise.all([
    prismaAny.kycDocument.findFirst({
      where: { fileUrl: { in: fileUrlCandidates } },
      select: { id: true },
    }),
    prismaAny.candidateDocument.findFirst({
      where: { fileUrl: { in: fileUrlCandidates } },
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
  const absoluteUrl = /^https?:\/\//i.test(fileUrl)
    ? fileUrl
    : `${getApiOrigin(req)}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;

  return {
    message: 'File uploaded successfully.',
    file: {
      access: visibility,
      fileName: fileName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      fileUrl,
      absoluteUrl,
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
    const { fileId } = await uploadFileToDrive(
      file.buffer,
      file.mimetype,
      file.originalname,
      undefined,
      { access: 'private' },
    );
    const secureUrl = getSecureDocumentUrl(fileId);
    
    res.status(201).json(buildUploadResponse(req, file, 'secure', secureUrl, file.originalname));
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

    const settings = await getAppSettings();
    const listingMediaFolderId = settings.googleDrive.backupFolderId?.trim();
    if (!listingMediaFolderId) {
      throw new Error('Google Drive listing media folder is not configured.');
    }

    const { fileId, viewLink } = await uploadFileToDrive(
      file.buffer,
      file.mimetype,
      file.originalname,
      listingMediaFolderId,
    );
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

    res.status(201).json(await uploadPublicBrandingImageToDrive(req, file, 'finance-support'));
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

    res.status(201).json(await uploadPublicBrandingImageToDrive(req, file, 'hero-image'));
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

    res.status(201).json(await uploadPublicBrandingImageToDrive(req, file, 'inspection-section'));
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

    res.status(201).json(await uploadPublicBrandingImageToDrive(req, file, 'site-logo'));
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

    res.status(201).json(await uploadPublicBrandingImageToDrive(req, file, 'site-dark-logo'));
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

    res.status(201).json(await uploadPublicBrandingImageToDrive(req, file, 'site-favicon'));
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

    res.status(201).json(await uploadPublicBrandingImageToDrive(req, file, 'site-manifest-icon'));
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

    const fileUrl = fileName.startsWith('drive-')
      ? getSecureDocumentUrlFromToken(fileName)
      : getSecureDocumentUrl(fileName);
    const fileExistsInRecords = await secureDocumentExists(fileUrl);

    if (!fileExistsInRecords) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const isStaffOperator = ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(req.user.role);
    const hasAccess = isStaffOperator || (await isSecureDocumentOwner(req.user.id, fileUrl));

    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this document.' });
    }

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const driveFileId = extractDriveFileId(fileUrl);
    if (driveFileId) {
      const stream = await streamFileFromDrive(driveFileId);
      stream.on('error', next);
      stream.pipe(res);
      return;
    }

    const absolutePath = path.join(secureUploadDir, fileName);
    await fs.access(absolutePath);
    res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
};
