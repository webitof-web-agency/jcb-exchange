import { Router } from 'express';
import {
  uploadPublicFinanceSupportImage,
  uploadPublicHeroImage,
  uploadPublicInspectionSectionImage,
  uploadPublicSiteManifestIconImage,
  uploadPublicSiteFaviconImage,
  uploadPublicSiteLogoImage,
  getSecureDocument,
  uploadPublicListingMedia,
  uploadPublicDocument,
  uploadCustomerPrimeReceipt,
  uploadSecureDocument,
} from '../controllers/document.controller';
import { requireAuth, requirePortalOperator } from '../middlewares/auth.middleware';
import { getDocumentUploadMiddleware } from '../utils/documentUpload';

const router = Router();

const secureUpload = getDocumentUploadMiddleware('secure');
const publicUpload = getDocumentUploadMiddleware('public');
const publicListingMediaUpload = getDocumentUploadMiddleware('public', 'listing-media');
const publicFinanceSupportUpload = getDocumentUploadMiddleware('public', 'finance-support');
const publicHeroImageUpload = getDocumentUploadMiddleware('public', 'hero-image');
const publicInspectionSectionUpload = getDocumentUploadMiddleware('public', 'inspection-section');
const publicSiteLogoUpload = getDocumentUploadMiddleware('public', 'site-logo');
const publicSiteFaviconUpload = getDocumentUploadMiddleware('public', 'site-favicon');
const publicSiteManifestIconUpload = getDocumentUploadMiddleware('public', 'site-manifest-icon');

router.post('/upload/secure', requireAuth, requirePortalOperator, secureUpload.single('file'), uploadSecureDocument);
router.post('/upload/public', requireAuth, requirePortalOperator, publicUpload.single('file'), uploadPublicDocument);
router.post('/upload/public/customer-prime-receipt', requireAuth, publicUpload.single('file'), uploadCustomerPrimeReceipt);
router.post(
  '/upload/public/finance-support',
  requireAuth,
  requirePortalOperator,
  publicFinanceSupportUpload.single('file'),
  uploadPublicFinanceSupportImage
);
router.post(
  '/upload/public/hero-image',
  requireAuth,
  requirePortalOperator,
  publicHeroImageUpload.single('file'),
  uploadPublicHeroImage
);
router.post(
  '/upload/public/inspection-section',
  requireAuth,
  requirePortalOperator,
  publicInspectionSectionUpload.single('file'),
  uploadPublicInspectionSectionImage
);
router.post(
  '/upload/public/site-logo',
  requireAuth,
  requirePortalOperator,
  publicSiteLogoUpload.single('file'),
  uploadPublicSiteLogoImage
);
router.post(
  '/upload/public/site-favicon',
  requireAuth,
  requirePortalOperator,
  publicSiteFaviconUpload.single('file'),
  uploadPublicSiteFaviconImage
);
router.post(
  '/upload/public/site-manifest-icon',
  requireAuth,
  requirePortalOperator,
  publicSiteManifestIconUpload.single('file'),
  uploadPublicSiteManifestIconImage
);
router.post(
  '/upload/public/listing-media',
  requireAuth,
  publicListingMediaUpload.single('file'),
  uploadPublicListingMedia
);
router.get('/secure/:filename', requireAuth, requirePortalOperator, getSecureDocument);

export default router;
