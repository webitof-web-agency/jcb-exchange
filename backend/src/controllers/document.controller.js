"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSecureDocument = exports.uploadPublicSiteFaviconImage = exports.uploadPublicSiteLogoImage = exports.uploadPublicInspectionSectionImage = exports.uploadPublicHeroImage = exports.uploadPublicFinanceSupportImage = exports.uploadPublicListingMedia = exports.uploadCustomerPrimeReceipt = exports.uploadPublicDocument = exports.uploadSecureDocument = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const documentUpload_1 = require("../utils/documentUpload");
const prismaAny = prisma_1.default;
const getApiOrigin = (req) => `${req.protocol}://${req.get('host')}`;
const getUploadedFile = (req) => req.file;
const cleanupFile = async (filePath) => {
    if (!filePath) {
        return;
    }
    try {
        await fs_1.promises.unlink(filePath);
    }
    catch {
        // Ignore cleanup failures for already-missing temp files.
    }
};
const enforceStoredFileSizePolicy = async (file, purpose = 'document') => {
    if ((0, documentUpload_1.isPdfMimeType)(file.mimetype) && file.size > 3 * 1024 * 1024) {
        await cleanupFile(file.path);
        throw new Error('PDF files must be 3MB or smaller.');
    }
    if (purpose === 'document' && !(0, documentUpload_1.isPdfMimeType)(file.mimetype) && file.size > documentUpload_1.MAX_DOCUMENT_UPLOAD_SIZE) {
        await cleanupFile(file.path);
        throw new Error('Image files must be 5MB or smaller.');
    }
    if (purpose === 'listing-media') {
        if ((0, documentUpload_1.isVideoMimeType)(file.mimetype) && file.size > documentUpload_1.MAX_LISTING_VIDEO_UPLOAD_SIZE) {
            await cleanupFile(file.path);
            throw new Error('Video files must be 15MB or smaller.');
        }
        if (!(0, documentUpload_1.isVideoMimeType)(file.mimetype) && file.size > documentUpload_1.MAX_DOCUMENT_UPLOAD_SIZE) {
            await cleanupFile(file.path);
            throw new Error('Image files must be 5MB or smaller.');
        }
    }
    if (purpose === 'finance-support' && file.size > documentUpload_1.MAX_FINANCE_SUPPORT_IMAGE_UPLOAD_SIZE) {
        await cleanupFile(file.path);
        throw new Error('Finance support logo image must be 2MB or smaller.');
    }
    if (purpose === 'hero-image' && file.size > documentUpload_1.MAX_HERO_IMAGE_UPLOAD_SIZE) {
        await cleanupFile(file.path);
        throw new Error('Hero image must be 5MB or smaller.');
    }
    if (purpose === 'inspection-section' && file.size > documentUpload_1.MAX_INSPECTION_SECTION_IMAGE_UPLOAD_SIZE) {
        await cleanupFile(file.path);
        throw new Error('Inspection section image must be 5MB or smaller.');
    }
    if (purpose === 'site-logo' && file.size > documentUpload_1.MAX_SITE_LOGO_IMAGE_UPLOAD_SIZE) {
        await cleanupFile(file.path);
        throw new Error('Site logo image must be 2MB or smaller.');
    }
    if (purpose === 'site-favicon' && file.size > documentUpload_1.MAX_SITE_FAVICON_IMAGE_UPLOAD_SIZE) {
        await cleanupFile(file.path);
        throw new Error('Favicon image must be 512KB or smaller.');
    }
};
const getSafeFileName = (fileName) => path_1.default.basename(fileName);
const isSecureDocumentOwner = async (userId, fileUrl) => {
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
const secureDocumentExists = async (fileUrl) => {
    const matchingDocument = await prismaAny.kycDocument.findFirst({
        where: { fileUrl },
        select: { id: true },
    });
    return !!matchingDocument;
};
const buildUploadResponse = (req, file, visibility, purpose = 'document') => {
    const fileUrl = visibility === 'public'
        ? purpose === 'listing-media'
            ? (0, documentUpload_1.getPublicListingMediaUrl)(file.filename)
            : purpose === 'finance-support'
                ? (0, documentUpload_1.getPublicFinanceSupportImageUrl)(file.filename)
                : purpose === 'hero-image'
                    ? (0, documentUpload_1.getPublicHeroImageUrl)(file.filename)
                    : purpose === 'inspection-section'
                        ? (0, documentUpload_1.getPublicInspectionSectionImageUrl)(file.filename)
                        : purpose === 'site-logo'
                            ? (0, documentUpload_1.getPublicSiteLogoUrl)(file.filename)
                            : purpose === 'site-favicon'
                                ? (0, documentUpload_1.getPublicSiteFaviconUrl)(file.filename)
                        : (0, documentUpload_1.getPublicDocumentUrl)(file.filename)
        : (0, documentUpload_1.getSecureDocumentUrl)(file.filename);
    return {
        message: 'File uploaded successfully.',
        file: {
            access: visibility,
            fileName: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            fileUrl,
            absoluteUrl: `${getApiOrigin(req)}${fileUrl}`,
        },
    };
};
const uploadSecureDocument = async (req, res, next) => {
    try {
        const file = getUploadedFile(req);
        if (!file) {
            return res.status(400).json({ error: 'A file is required.' });
        }
        await enforceStoredFileSizePolicy(file, 'document');
        res.status(201).json(buildUploadResponse(req, file, 'secure'));
    }
    catch (error) {
        next(error);
    }
};
exports.uploadSecureDocument = uploadSecureDocument;
const uploadPublicDocument = async (req, res, next) => {
    try {
        const file = getUploadedFile(req);
        if (!file) {
            return res.status(400).json({ error: 'A file is required.' });
        }
        await enforceStoredFileSizePolicy(file, 'document');
        res.status(201).json(buildUploadResponse(req, file, 'public'));
    }
    catch (error) {
        next(error);
    }
};
exports.uploadPublicDocument = uploadPublicDocument;
const uploadCustomerPrimeReceipt = async (req, res, next) => {
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
        res.status(201).json(buildUploadResponse(req, file, 'public'));
    }
    catch (error) {
        next(error);
    }
};
exports.uploadCustomerPrimeReceipt = uploadCustomerPrimeReceipt;
const uploadPublicListingMedia = async (req, res, next) => {
    try {
        const file = getUploadedFile(req);
        if (!file) {
            return res.status(400).json({ error: 'A file is required.' });
        }
        await enforceStoredFileSizePolicy(file, 'listing-media');
        res.status(201).json(buildUploadResponse(req, file, 'public', 'listing-media'));
    }
    catch (error) {
        next(error);
    }
};
exports.uploadPublicListingMedia = uploadPublicListingMedia;
const uploadPublicFinanceSupportImage = async (req, res, next) => {
    try {
        const file = getUploadedFile(req);
        if (!file) {
            return res.status(400).json({ error: 'A file is required.' });
        }
        await enforceStoredFileSizePolicy(file, 'finance-support');
        res.status(201).json(buildUploadResponse(req, file, 'public', 'finance-support'));
    }
    catch (error) {
        next(error);
    }
};
exports.uploadPublicFinanceSupportImage = uploadPublicFinanceSupportImage;
const uploadPublicHeroImage = async (req, res, next) => {
    try {
        const file = getUploadedFile(req);
        if (!file) {
            return res.status(400).json({ error: 'A file is required.' });
        }
        await enforceStoredFileSizePolicy(file, 'hero-image');
        res.status(201).json(buildUploadResponse(req, file, 'public', 'hero-image'));
    }
    catch (error) {
        next(error);
    }
};
exports.uploadPublicHeroImage = uploadPublicHeroImage;
const uploadPublicInspectionSectionImage = async (req, res, next) => {
    try {
        const file = getUploadedFile(req);
        if (!file) {
            return res.status(400).json({ error: 'A file is required.' });
        }
        await enforceStoredFileSizePolicy(file, 'inspection-section');
        res.status(201).json(buildUploadResponse(req, file, 'public', 'inspection-section'));
    }
    catch (error) {
        next(error);
    }
};
exports.uploadPublicInspectionSectionImage = uploadPublicInspectionSectionImage;
const uploadPublicSiteLogoImage = async (req, res, next) => {
    try {
        const file = getUploadedFile(req);
        if (!file) {
            return res.status(400).json({ error: 'A file is required.' });
        }
        await enforceStoredFileSizePolicy(file, 'site-logo');
        res.status(201).json(buildUploadResponse(req, file, 'public', 'site-logo'));
    }
    catch (error) {
        next(error);
    }
};
exports.uploadPublicSiteLogoImage = uploadPublicSiteLogoImage;
const uploadPublicSiteFaviconImage = async (req, res, next) => {
    try {
        const file = getUploadedFile(req);
        if (!file) {
            return res.status(400).json({ error: 'A file is required.' });
        }
        await enforceStoredFileSizePolicy(file, 'site-favicon');
        res.status(201).json(buildUploadResponse(req, file, 'public', 'site-favicon'));
    }
    catch (error) {
        next(error);
    }
};
exports.uploadPublicSiteFaviconImage = uploadPublicSiteFaviconImage;
const getSecureDocument = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const fileName = getSafeFileName(String(req.params.filename || ''));
        if (!fileName) {
            return res.status(400).json({ error: 'Invalid filename.' });
        }
        const fileUrl = (0, documentUpload_1.getSecureDocumentUrl)(fileName);
        const fileExistsInRecords = await secureDocumentExists(fileUrl);
        if (!fileExistsInRecords) {
            return res.status(404).json({ error: 'Document not found.' });
        }
        const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role);
        const hasAccess = isAdmin || (await isSecureDocumentOwner(req.user.id, fileUrl));
        if (!hasAccess) {
            return res.status(403).json({ error: 'You do not have access to this document.' });
        }
        const absolutePath = path_1.default.join(documentUpload_1.secureUploadDir, fileName);
        await fs_1.promises.access(absolutePath);
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.sendFile(absolutePath);
    }
    catch (error) {
        next(error);
    }
};
exports.getSecureDocument = getSecureDocument;
//# sourceMappingURL=document.controller.js.map
