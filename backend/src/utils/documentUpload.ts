import multer from 'multer';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import crypto from 'crypto';

export type UploadVisibility = 'public' | 'secure';
export type UploadPurpose =
  | 'document'
  | 'listing-media'
  | 'finance-support'
  | 'hero-image'
  | 'inspection-section'
  | 'site-logo'
  | 'site-favicon'
  | 'site-manifest-icon';

const allowedDocumentMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
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

const allowedListingMediaExtensionsByMimeType: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'video/quicktime': ['.mov'],
};

export const MAX_DOCUMENT_UPLOAD_SIZE = 5 * 1024 * 1024;
export const MAX_LISTING_VIDEO_UPLOAD_SIZE = 15 * 1024 * 1024;
export const MAX_FINANCE_SUPPORT_IMAGE_UPLOAD_SIZE = 2 * 1024 * 1024;
export const MAX_HERO_IMAGE_UPLOAD_SIZE = 5 * 1024 * 1024;
export const MAX_INSPECTION_SECTION_IMAGE_UPLOAD_SIZE = 5 * 1024 * 1024;
export const MAX_SITE_LOGO_IMAGE_UPLOAD_SIZE = 2 * 1024 * 1024;
export const MAX_SITE_FAVICON_IMAGE_UPLOAD_SIZE = 512 * 1024;
export const MAX_SITE_MANIFEST_ICON_IMAGE_UPLOAD_SIZE = 1024 * 1024;

export const uploadRootDir = path.join(process.cwd(), 'uploads');
export const publicUploadDir = path.join(uploadRootDir, 'public');
export const secureUploadDir = path.join(uploadRootDir, 'secure');
export const publicListingMediaUploadDir = path.join(publicUploadDir, 'listings');
export const publicFinanceSupportUploadDir = path.join(publicUploadDir, 'finance-support');
export const publicHeroImageUploadDir = path.join(publicUploadDir, 'hero-image');
export const publicInspectionSectionUploadDir = path.join(publicUploadDir, 'inspection-section');
export const publicSiteLogoUploadDir = path.join(publicUploadDir, 'site-logo');
export const publicSiteFaviconUploadDir = path.join(publicUploadDir, 'site-favicon');
export const publicSiteManifestIconUploadDir = path.join(publicUploadDir, 'site-manifest-icon');

const ensureDirectory = (directoryPath: string) => {
  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true });
  }
};

export const ensureUploadDirectories = () => {
  ensureDirectory(publicUploadDir);
  ensureDirectory(secureUploadDir);
  ensureDirectory(publicListingMediaUploadDir);
  ensureDirectory(publicFinanceSupportUploadDir);
  ensureDirectory(publicHeroImageUploadDir);
  ensureDirectory(publicInspectionSectionUploadDir);
  ensureDirectory(publicSiteLogoUploadDir);
  ensureDirectory(publicSiteFaviconUploadDir);
  ensureDirectory(publicSiteManifestIconUploadDir);
};

const getUploadDirectory = (visibility: UploadVisibility, purpose: UploadPurpose) => {
  if (visibility === 'public' && purpose === 'finance-support') {
    return publicFinanceSupportUploadDir;
  }

  if (visibility === 'public' && purpose === 'hero-image') {
    return publicHeroImageUploadDir;
  }

  if (visibility === 'public' && purpose === 'inspection-section') {
    return publicInspectionSectionUploadDir;
  }

  if (visibility === 'public' && purpose === 'site-logo') {
    return publicSiteLogoUploadDir;
  }

  if (visibility === 'public' && purpose === 'site-favicon') {
    return publicSiteFaviconUploadDir;
  }

  if (visibility === 'public' && purpose === 'site-manifest-icon') {
    return publicSiteManifestIconUploadDir;
  }

  if (visibility === 'public' && purpose === 'listing-media') {
    return publicListingMediaUploadDir;
  }

  return visibility === 'public' ? publicUploadDir : secureUploadDir;
};

const getExtensionFromOriginalName = (fileName: string) => path.extname(fileName || '').toLowerCase();

export const isAllowedDocumentFile = (mimeType: string, originalName: string) => {
  if (!allowedDocumentMimeTypes.has(mimeType)) {
    return false;
  }

  const extension = getExtensionFromOriginalName(originalName);
  const allowedExtensions = allowedDocumentExtensionsByMimeType[mimeType] || [];
  return allowedExtensions.includes(extension);
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

export const getDocumentUploadMiddleware = (
  visibility: UploadVisibility,
  purpose: UploadPurpose = 'document'
) =>
  multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        const targetDirectory = getUploadDirectory(visibility, purpose);
        ensureDirectory(targetDirectory);
        callback(null, targetDirectory);
      },
      filename: (_req, file, callback) => {
        const extension = getExtensionFromOriginalName(file.originalname);
        callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
      },
    }),
    fileFilter: (_req, file, callback) => {
      const allowed =
        purpose === 'listing-media'
          ? isAllowedListingMediaFile(file.mimetype, file.originalname)
          : purpose === 'finance-support' || purpose === 'hero-image' || purpose === 'inspection-section' || purpose === 'site-logo' || purpose === 'site-favicon' || purpose === 'site-manifest-icon'
            ? isAllowedFinanceSupportImageFile(file.mimetype, file.originalname)
            : isAllowedDocumentFile(file.mimetype, file.originalname);

      if (!allowed) {
        callback(
          new Error(
            purpose === 'listing-media'
              ? 'Only JPG, PNG, WEBP, MP4, WEBM, and MOV files are allowed.'
              : purpose === 'finance-support' || purpose === 'hero-image' || purpose === 'inspection-section' || purpose === 'site-logo' || purpose === 'site-favicon' || purpose === 'site-manifest-icon'
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
        purpose === 'listing-media'
          ? MAX_LISTING_VIDEO_UPLOAD_SIZE
          : purpose === 'inspection-section'
            ? MAX_INSPECTION_SECTION_IMAGE_UPLOAD_SIZE
          : purpose === 'site-logo'
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
  });

export const isPdfMimeType = (mimeType?: string | null) => mimeType === 'application/pdf';
export const isVideoMimeType = (mimeType?: string | null) =>
  mimeType === 'video/mp4' || mimeType === 'video/webm' || mimeType === 'video/quicktime';

export const getSecureDocumentUrl = (fileName: string) => `/api/documents/secure/${fileName}`;
export const getPublicDocumentUrl = (fileName: string) => `/uploads/public/${fileName}`;
export const getPublicListingMediaUrl = (fileName: string) => `/uploads/public/listings/${fileName}`;
export const getPublicFinanceSupportImageUrl = (fileName: string) => `/uploads/public/finance-support/${fileName}`;
export const getPublicHeroImageUrl = (fileName: string) => `/uploads/public/hero-image/${fileName}`;
export const getPublicInspectionSectionImageUrl = (fileName: string) => `/uploads/public/inspection-section/${fileName}`;
export const getPublicSiteLogoUrl = (fileName: string) => `/uploads/public/site-logo/${fileName}`;
export const getPublicSiteFaviconUrl = (fileName: string) => `/uploads/public/site-favicon/${fileName}`;
export const getPublicSiteManifestIconUrl = (fileName: string) => `/uploads/public/site-manifest-icon/${fileName}`;
