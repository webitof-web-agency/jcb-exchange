import 'dotenv/config';
import multer from 'multer';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';
import { contentMatchesMimeType, FILE_CONTENT_MISMATCH_MESSAGE } from './fileSignature';

export type UploadVisibility = 'public' | 'secure';
export type UploadPurpose =
  | 'document'
  | 'passport-photo'
  | 'resume'
  | 'offer-letter'
  | 'listing-media'
  | 'finance-support'
  | 'blog-cover'
  | 'hero-image'
  | 'inspection-section'
  | 'site-logo'
  | 'site-dark-logo'
  | 'site-favicon'
  | 'site-manifest-icon';

const allowedDocumentMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const allowedResumeMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);

const allowedListingMediaMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const allowedDocumentExtensionsByMimeType: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
};

const allowedPassportPhotoMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const allowedPassportPhotoExtensionsByMimeType: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

const allowedResumeExtensionsByMimeType: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

const allowedListingMediaExtensionsByMimeType: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'video/quicktime': ['.mov'],
};

export const MAX_DOCUMENT_UPLOAD_SIZE = 5 * 1024 * 1024;
export const MAX_PASSPORT_PHOTO_UPLOAD_SIZE = 3 * 1024 * 1024;
export const MAX_LISTING_VIDEO_UPLOAD_SIZE = 15 * 1024 * 1024;
export const MAX_FINANCE_SUPPORT_IMAGE_UPLOAD_SIZE = 2 * 1024 * 1024;
export const MAX_BLOG_COVER_IMAGE_UPLOAD_SIZE = 5 * 1024 * 1024;
export const MAX_HERO_IMAGE_UPLOAD_SIZE = 5 * 1024 * 1024;
export const MAX_INSPECTION_SECTION_IMAGE_UPLOAD_SIZE = 5 * 1024 * 1024;
export const MAX_SITE_LOGO_IMAGE_UPLOAD_SIZE = 2 * 1024 * 1024;
export const MAX_SITE_FAVICON_IMAGE_UPLOAD_SIZE = 512 * 1024;
export const MAX_SITE_MANIFEST_ICON_IMAGE_UPLOAD_SIZE = 1024 * 1024;
export const MAX_AVATAR_UPLOAD_SIZE = 2 * 1024 * 1024;

const resolveStorageBaseDir = () => {
  const configuredDirectory = process.env.APP_STORAGE_DIR?.trim();
  if (!configuredDirectory) {
    return process.cwd();
  }

  return path.isAbsolute(configuredDirectory)
    ? configuredDirectory
    : path.resolve(process.cwd(), configuredDirectory);
};

export const storageBaseDir = resolveStorageBaseDir();
export const storagePersistenceConfigured = Boolean(process.env.APP_STORAGE_DIR?.trim());
export const uploadRootDir = path.join(storageBaseDir, 'uploads');
export const publicUploadDir = path.join(uploadRootDir, 'public');
export const secureUploadDir = path.join(uploadRootDir, 'secure');
export const publicListingMediaUploadDir = path.join(publicUploadDir, 'listings');

const getExtensionFromOriginalName = (fileName: string) => path.extname(fileName || '').toLowerCase();

export const isAllowedDocumentFile = (mimeType: string, originalName: string) => {
  if (!allowedDocumentMimeTypes.has(mimeType)) {
    return false;
  }

  const extension = getExtensionFromOriginalName(originalName);
  const allowedExtensions = allowedDocumentExtensionsByMimeType[mimeType] || [];
  return allowedExtensions.includes(extension);
};

export const isAllowedPassportPhotoFile = (mimeType: string, originalName: string) => {
  if (!allowedPassportPhotoMimeTypes.has(mimeType)) {
    return false;
  }

  const extension = getExtensionFromOriginalName(originalName);
  return (allowedPassportPhotoExtensionsByMimeType[mimeType] || []).includes(extension);
};

export const isAllowedListingMediaFile = (mimeType: string, originalName: string) => {
  if (!allowedListingMediaMimeTypes.has(mimeType)) {
    return false;
  }

  const extension = getExtensionFromOriginalName(originalName);
  const allowedExtensions = allowedListingMediaExtensionsByMimeType[mimeType] || [];
  return allowedExtensions.includes(extension);
};

export const isAllowedFinanceSupportImageFile = (mimeType: string, originalName: string) => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    return false;
  }

  const extension = getExtensionFromOriginalName(originalName);
  const allowedExtensions = allowedDocumentExtensionsByMimeType[mimeType] || [];
  return allowedExtensions.includes(extension);
};

export const isAllowedResumeFile = (mimeType: string, originalName: string) => {
  if (!allowedResumeMimeTypes.has(mimeType)) {
    return false;
  }

  const extension = getExtensionFromOriginalName(originalName);
  const allowedExtensions = allowedResumeExtensionsByMimeType[mimeType] || [];
  return allowedExtensions.includes(extension);
};

export const getUploadFileSizeLimit = (purpose: UploadPurpose) => {
  if (purpose === 'passport-photo') return MAX_PASSPORT_PHOTO_UPLOAD_SIZE;
  if (purpose === 'listing-media') return MAX_LISTING_VIDEO_UPLOAD_SIZE;
  if (purpose === 'blog-cover') return MAX_BLOG_COVER_IMAGE_UPLOAD_SIZE;
  if (purpose === 'inspection-section') return MAX_INSPECTION_SECTION_IMAGE_UPLOAD_SIZE;
  if (purpose === 'site-logo' || purpose === 'site-dark-logo') return MAX_SITE_LOGO_IMAGE_UPLOAD_SIZE;
  if (purpose === 'site-favicon') return MAX_SITE_FAVICON_IMAGE_UPLOAD_SIZE;
  if (purpose === 'site-manifest-icon') return MAX_SITE_MANIFEST_ICON_IMAGE_UPLOAD_SIZE;
  if (purpose === 'hero-image') return MAX_HERO_IMAGE_UPLOAD_SIZE;
  if (purpose === 'finance-support') return MAX_FINANCE_SUPPORT_IMAGE_UPLOAD_SIZE;
  return MAX_DOCUMENT_UPLOAD_SIZE;
};

// After multer has read the file into memory, its first bytes must match the declared type: the MIME type
// and file name checked by the filters above are both chosen by the uploader.
const withContentCheck = (upload: multer.Multer): multer.Multer => {
  const single = upload.single.bind(upload);
  upload.single = (fieldName: string) => {
    const parse = single(fieldName);
    return (req: Request, res: Response, next: NextFunction) => {
      parse(req, res, (error?: unknown) => {
        if (error) return next(error);
        const file = req.file;
        if (file && !contentMatchesMimeType(file.buffer, file.mimetype)) {
          delete req.file;
          return next(new Error(FILE_CONTENT_MISMATCH_MESSAGE));
        }
        return next();
      });
    };
  };
  return upload;
};

export const getDocumentUploadMiddleware = (
  visibility: UploadVisibility,
  purpose: UploadPurpose = 'document'
) =>
  withContentCheck(multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, callback) => {
      const allowed =
        purpose === 'resume' || purpose === 'offer-letter'
          ? isAllowedResumeFile(file.mimetype, file.originalname)
          : purpose === 'passport-photo'
            ? isAllowedPassportPhotoFile(file.mimetype, file.originalname)
          : purpose === 'listing-media'
            ? isAllowedListingMediaFile(file.mimetype, file.originalname)
              : purpose === 'finance-support' || purpose === 'blog-cover' || purpose === 'hero-image' || purpose === 'inspection-section' || purpose === 'site-logo' || purpose === 'site-dark-logo' || purpose === 'site-favicon' || purpose === 'site-manifest-icon'
              ? isAllowedFinanceSupportImageFile(file.mimetype, file.originalname)
              : isAllowedDocumentFile(file.mimetype, file.originalname);

      if (!allowed) {
        callback(
          new Error(
            purpose === 'resume' || purpose === 'offer-letter'
              ? 'Only PDF, DOC, and DOCX files are allowed for resumes and documents.'
              : purpose === 'passport-photo'
                ? 'Only JPG, PNG, and WEBP passport photos are allowed.'
              : purpose === 'listing-media'
                ? 'Only JPG, PNG, WEBP, MP4, WEBM, and MOV files are allowed.'
                : purpose === 'finance-support' || purpose === 'blog-cover' || purpose === 'hero-image' || purpose === 'inspection-section' || purpose === 'site-logo' || purpose === 'site-favicon' || purpose === 'site-manifest-icon'
                  ? 'Only JPG, PNG, and WEBP images are allowed.'
                  : 'Only JPG, PNG, WEBP, and PDF files are allowed.'
          )
        );
        return;
      }

      callback(null, true);
    },
    limits: {
      fileSize:
        purpose === 'passport-photo'
          ? MAX_PASSPORT_PHOTO_UPLOAD_SIZE
          : purpose === 'listing-media'
          ? MAX_LISTING_VIDEO_UPLOAD_SIZE
          : purpose === 'blog-cover'
            ? MAX_BLOG_COVER_IMAGE_UPLOAD_SIZE
          : purpose === 'inspection-section'
            ? MAX_INSPECTION_SECTION_IMAGE_UPLOAD_SIZE
          : purpose === 'site-logo'
            ? MAX_SITE_LOGO_IMAGE_UPLOAD_SIZE
          : purpose === 'site-dark-logo'
            ? MAX_SITE_LOGO_IMAGE_UPLOAD_SIZE
          : purpose === 'site-favicon'
            ? MAX_SITE_FAVICON_IMAGE_UPLOAD_SIZE
          : purpose === 'site-manifest-icon'
            ? MAX_SITE_MANIFEST_ICON_IMAGE_UPLOAD_SIZE
          : purpose === 'hero-image'
            ? MAX_HERO_IMAGE_UPLOAD_SIZE
          : purpose === 'finance-support'
            ? MAX_FINANCE_SUPPORT_IMAGE_UPLOAD_SIZE
            : MAX_DOCUMENT_UPLOAD_SIZE,
      files: 1,
    },
  }));

export const getAvatarUploadMiddleware = () =>
  withContentCheck(multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, callback) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        callback(new Error('Only JPG, PNG, and WEBP avatar images are allowed.'));
        return;
      }

      callback(null, true);
    },
    limits: {
      fileSize: MAX_AVATAR_UPLOAD_SIZE,
      files: 1,
    },
  }));

export const isPdfMimeType = (mimeType?: string | null) => mimeType === 'application/pdf';
export const isVideoMimeType = (mimeType?: string | null) =>
  mimeType === 'video/mp4' || mimeType === 'video/webm' || mimeType === 'video/quicktime';

export { getSecureDocumentUrl } from './secureDocumentUrl';
