import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
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
  publicUploadDir,
  secureUploadDir,
} from '../utils/documentUpload';
import {
  uploadFileToDrive,
  extractDriveFileId,
  streamFileFromDrive,
  streamDriveMediaWithHeaders,
} from '../services/googleDrive.service';
import { getAppSettings } from '../utils/appSettings';
import { getSecureDocumentUrlFromToken } from '../utils/secureDocumentUrl';
import {
  buildPublicBrandingFileName,
  buildPublicBrandingFileUrl,
  PublicBrandingPurpose,
} from '../utils/publicBrandingUpload';
import { parseSingleByteRange } from '../utils/httpRange';

const savePublicBrandingImageLocally = async (
  req: Request,
  file: Express.Multer.File,
  purpose: PublicBrandingPurpose,
) => {
  await enforceStoredFileSizePolicy(file, purpose);

  const fileName = buildPublicBrandingFileName(
    purpose,
    file.originalname,
    randomUUID(),
    file.mimetype,
  );
  const purposeDirectory = path.join(publicUploadDir, purpose);
  const destinationPath = path.join(purposeDirectory, fileName);

  await fs.mkdir(purposeDirectory, { recursive: true });
  await fs.writeFile(destinationPath, file.buffer);

  return buildUploadResponse(
    req,
    file,
    'public',
    buildPublicBrandingFileUrl(purpose, fileName),
    fileName,
  );
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



    res.status(201).json(await savePublicBrandingImageLocally(req, file, 'listing-media'));

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

    res.status(201).json(await savePublicBrandingImageLocally(req, file, 'finance-support'));
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

    res.status(201).json(await savePublicBrandingImageLocally(req, file, 'hero-image'));
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

    res.status(201).json(await savePublicBrandingImageLocally(req, file, 'inspection-section'));
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

    res.status(201).json(await savePublicBrandingImageLocally(req, file, 'site-logo'));
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

    res.status(201).json(await savePublicBrandingImageLocally(req, file, 'site-dark-logo'));
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

    res.status(201).json(await savePublicBrandingImageLocally(req, file, 'site-favicon'));
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

    res.status(201).json(await savePublicBrandingImageLocally(req, file, 'site-manifest-icon'));
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

export const getPublicDriveMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fileId = decodeURIComponent(String(req.params.fileId || '')).trim();
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) {
      return res.status(400).json({ error: 'File ID is required.' });
    }

    const range = typeof req.headers.range === 'string' ? req.headers.range : undefined;
    const { stream, headers } = await streamDriveMediaWithHeaders(fileId, range);
    const contentType = String(headers['content-type'] || 'application/octet-stream');
    const contentLength = headers['content-length'];
    const contentRange = headers['content-range'];
    const totalSize = Number(contentLength);
    const byteRange = range && Number.isSafeInteger(totalSize)
      ? parseSingleByteRange(range, totalSize)
      : null;

    if (range && Number.isSafeInteger(totalSize) && !byteRange) {
      stream.destroy();
      res.setHeader('Content-Range', `bytes */${totalSize}`);
      return res.status(416).end();
    }

    res.status(byteRange || contentRange ? 206 : 200);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (byteRange) {
      res.setHeader('Content-Length', String(byteRange.length));
      res.setHeader('Content-Range', `bytes ${byteRange.start}-${byteRange.end}/${byteRange.total}`);
    } else if (contentLength) {
      res.setHeader('Content-Length', String(contentLength));
    }
    if (contentRange && !byteRange) res.setHeader('Content-Range', String(contentRange));

    stream.on('error', next);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};
