"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicSiteFaviconUrl = exports.getPublicSiteLogoUrl = exports.getPublicInspectionSectionImageUrl = exports.getPublicHeroImageUrl = exports.getPublicFinanceSupportImageUrl = exports.getPublicListingMediaUrl = exports.getPublicDocumentUrl = exports.getSecureDocumentUrl = exports.isVideoMimeType = exports.isPdfMimeType = exports.getDocumentUploadMiddleware = exports.isAllowedFinanceSupportImageFile = exports.isAllowedListingMediaFile = exports.isAllowedDocumentFile = exports.ensureUploadDirectories = exports.publicSiteFaviconUploadDir = exports.publicSiteLogoUploadDir = exports.publicInspectionSectionUploadDir = exports.publicHeroImageUploadDir = exports.publicFinanceSupportUploadDir = exports.publicListingMediaUploadDir = exports.secureUploadDir = exports.publicUploadDir = exports.uploadRootDir = exports.MAX_SITE_FAVICON_IMAGE_UPLOAD_SIZE = exports.MAX_SITE_LOGO_IMAGE_UPLOAD_SIZE = exports.MAX_INSPECTION_SECTION_IMAGE_UPLOAD_SIZE = exports.MAX_HERO_IMAGE_UPLOAD_SIZE = exports.MAX_FINANCE_SUPPORT_IMAGE_UPLOAD_SIZE = exports.MAX_LISTING_VIDEO_UPLOAD_SIZE = exports.MAX_DOCUMENT_UPLOAD_SIZE = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const crypto_1 = __importDefault(require("crypto"));
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
const allowedDocumentExtensionsByMimeType = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
    'application/pdf': ['.pdf'],
};
const allowedListingMediaExtensionsByMimeType = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
    'video/mp4': ['.mp4'],
    'video/webm': ['.webm'],
    'video/quicktime': ['.mov'],
};
exports.MAX_DOCUMENT_UPLOAD_SIZE = 5 * 1024 * 1024;
exports.MAX_LISTING_VIDEO_UPLOAD_SIZE = 15 * 1024 * 1024;
exports.MAX_FINANCE_SUPPORT_IMAGE_UPLOAD_SIZE = 2 * 1024 * 1024;
exports.MAX_HERO_IMAGE_UPLOAD_SIZE = 5 * 1024 * 1024;
exports.MAX_INSPECTION_SECTION_IMAGE_UPLOAD_SIZE = 5 * 1024 * 1024;
exports.MAX_SITE_LOGO_IMAGE_UPLOAD_SIZE = 2 * 1024 * 1024;
exports.MAX_SITE_FAVICON_IMAGE_UPLOAD_SIZE = 512 * 1024;
exports.uploadRootDir = path_1.default.join(process.cwd(), 'uploads');
exports.publicUploadDir = path_1.default.join(exports.uploadRootDir, 'public');
exports.secureUploadDir = path_1.default.join(exports.uploadRootDir, 'secure');
exports.publicListingMediaUploadDir = path_1.default.join(exports.publicUploadDir, 'listings');
exports.publicFinanceSupportUploadDir = path_1.default.join(exports.publicUploadDir, 'finance-support');
exports.publicHeroImageUploadDir = path_1.default.join(exports.publicUploadDir, 'hero-image');
exports.publicInspectionSectionUploadDir = path_1.default.join(exports.publicUploadDir, 'inspection-section');
exports.publicSiteLogoUploadDir = path_1.default.join(exports.publicUploadDir, 'site-logo');
exports.publicSiteFaviconUploadDir = path_1.default.join(exports.publicUploadDir, 'site-favicon');
const ensureDirectory = (directoryPath) => {
    if (!(0, fs_1.existsSync)(directoryPath)) {
        (0, fs_1.mkdirSync)(directoryPath, { recursive: true });
    }
};
const ensureUploadDirectories = () => {
    ensureDirectory(exports.publicUploadDir);
    ensureDirectory(exports.secureUploadDir);
    ensureDirectory(exports.publicListingMediaUploadDir);
    ensureDirectory(exports.publicFinanceSupportUploadDir);
    ensureDirectory(exports.publicHeroImageUploadDir);
    ensureDirectory(exports.publicInspectionSectionUploadDir);
    ensureDirectory(exports.publicSiteLogoUploadDir);
    ensureDirectory(exports.publicSiteFaviconUploadDir);
};
exports.ensureUploadDirectories = ensureUploadDirectories;
const getUploadDirectory = (visibility, purpose) => {
    if (visibility === 'public' && purpose === 'finance-support') {
        return exports.publicFinanceSupportUploadDir;
    }
    if (visibility === 'public' && purpose === 'hero-image') {
        return exports.publicHeroImageUploadDir;
    }
    if (visibility === 'public' && purpose === 'inspection-section') {
        return exports.publicInspectionSectionUploadDir;
    }
    if (visibility === 'public' && purpose === 'site-logo') {
        return exports.publicSiteLogoUploadDir;
    }
    if (visibility === 'public' && purpose === 'site-favicon') {
        return exports.publicSiteFaviconUploadDir;
    }
    if (visibility === 'public' && purpose === 'listing-media') {
        return exports.publicListingMediaUploadDir;
    }
    return visibility === 'public' ? exports.publicUploadDir : exports.secureUploadDir;
};
const getExtensionFromOriginalName = (fileName) => path_1.default.extname(fileName || '').toLowerCase();
const isAllowedDocumentFile = (mimeType, originalName) => {
    if (!allowedDocumentMimeTypes.has(mimeType)) {
        return false;
    }
    const extension = getExtensionFromOriginalName(originalName);
    const allowedExtensions = allowedDocumentExtensionsByMimeType[mimeType] || [];
    return allowedExtensions.includes(extension);
};
exports.isAllowedDocumentFile = isAllowedDocumentFile;
const isAllowedListingMediaFile = (mimeType, originalName) => {
    if (!allowedListingMediaMimeTypes.has(mimeType)) {
        return false;
    }
    const extension = getExtensionFromOriginalName(originalName);
    const allowedExtensions = allowedListingMediaExtensionsByMimeType[mimeType] || [];
    return allowedExtensions.includes(extension);
};
exports.isAllowedListingMediaFile = isAllowedListingMediaFile;
const isAllowedFinanceSupportImageFile = (mimeType, originalName) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        return false;
    }
    const extension = getExtensionFromOriginalName(originalName);
    const allowedExtensions = allowedDocumentExtensionsByMimeType[mimeType] || [];
    return allowedExtensions.includes(extension);
};
exports.isAllowedFinanceSupportImageFile = isAllowedFinanceSupportImageFile;
const getDocumentUploadMiddleware = (visibility, purpose = 'document') => (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, callback) => {
            const targetDirectory = getUploadDirectory(visibility, purpose);
            ensureDirectory(targetDirectory);
            callback(null, targetDirectory);
        },
        filename: (_req, file, callback) => {
            const extension = getExtensionFromOriginalName(file.originalname);
            callback(null, `${Date.now()}-${crypto_1.default.randomUUID()}${extension}`);
        },
    }),
    fileFilter: (_req, file, callback) => {
        const allowed = purpose === 'listing-media'
            ? (0, exports.isAllowedListingMediaFile)(file.mimetype, file.originalname)
            : purpose === 'finance-support' || purpose === 'hero-image' || purpose === 'inspection-section' || purpose === 'site-logo' || purpose === 'site-favicon'
                ? (0, exports.isAllowedFinanceSupportImageFile)(file.mimetype, file.originalname)
                : (0, exports.isAllowedDocumentFile)(file.mimetype, file.originalname);
        if (!allowed) {
            callback(new Error(purpose === 'listing-media'
                ? 'Only JPG, PNG, WEBP, MP4, WEBM, and MOV files are allowed.'
                : purpose === 'finance-support' || purpose === 'hero-image' || purpose === 'inspection-section' || purpose === 'site-logo' || purpose === 'site-favicon'
                    ? 'Only JPG, PNG, and WEBP images are allowed.'
                    : 'Only JPG, PNG, WEBP, and PDF files are allowed.'));
            return;
        }
        callback(null, true);
    },
    limits: {
        fileSize: purpose === 'listing-media'
            ? exports.MAX_LISTING_VIDEO_UPLOAD_SIZE
            : purpose === 'inspection-section'
                ? exports.MAX_INSPECTION_SECTION_IMAGE_UPLOAD_SIZE
                : purpose === 'site-logo'
                    ? exports.MAX_SITE_LOGO_IMAGE_UPLOAD_SIZE
                    : purpose === 'site-favicon'
                        ? exports.MAX_SITE_FAVICON_IMAGE_UPLOAD_SIZE
                : purpose === 'hero-image'
                    ? exports.MAX_HERO_IMAGE_UPLOAD_SIZE
                    : purpose === 'finance-support'
                        ? exports.MAX_FINANCE_SUPPORT_IMAGE_UPLOAD_SIZE
                        : exports.MAX_DOCUMENT_UPLOAD_SIZE,
        files: 1,
    },
});
exports.getDocumentUploadMiddleware = getDocumentUploadMiddleware;
const isPdfMimeType = (mimeType) => mimeType === 'application/pdf';
exports.isPdfMimeType = isPdfMimeType;
const isVideoMimeType = (mimeType) => mimeType === 'video/mp4' || mimeType === 'video/webm' || mimeType === 'video/quicktime';
exports.isVideoMimeType = isVideoMimeType;
const getSecureDocumentUrl = (fileName) => `/api/documents/secure/${fileName}`;
exports.getSecureDocumentUrl = getSecureDocumentUrl;
const getPublicDocumentUrl = (fileName) => `/uploads/public/${fileName}`;
exports.getPublicDocumentUrl = getPublicDocumentUrl;
const getPublicListingMediaUrl = (fileName) => `/uploads/public/listings/${fileName}`;
exports.getPublicListingMediaUrl = getPublicListingMediaUrl;
const getPublicFinanceSupportImageUrl = (fileName) => `/uploads/public/finance-support/${fileName}`;
exports.getPublicFinanceSupportImageUrl = getPublicFinanceSupportImageUrl;
const getPublicHeroImageUrl = (fileName) => `/uploads/public/hero-image/${fileName}`;
exports.getPublicHeroImageUrl = getPublicHeroImageUrl;
const getPublicInspectionSectionImageUrl = (fileName) => `/uploads/public/inspection-section/${fileName}`;
exports.getPublicInspectionSectionImageUrl = getPublicInspectionSectionImageUrl;
const getPublicSiteLogoUrl = (fileName) => `/uploads/public/site-logo/${fileName}`;
exports.getPublicSiteLogoUrl = getPublicSiteLogoUrl;
const getPublicSiteFaviconUrl = (fileName) => `/uploads/public/site-favicon/${fileName}`;
exports.getPublicSiteFaviconUrl = getPublicSiteFaviconUrl;
//# sourceMappingURL=documentUpload.js.map
