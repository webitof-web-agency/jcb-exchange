import { Router } from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getBrands,
  getModels,
  getIcons,
  createIcon,
  getApprovedDealers,
  getFinanceSupportItems,
  getHeroImage,
  getInspectionSection,
  getPublicListings,
  getRecentListings,
  getPublicCategories,
  getPublicSearchFilters,
  getPublicListingById,
  incrementListingView,
} from '../controllers/master.controller';
import {
  requireAuth,
  requirePortalOperator,
  requireSuperAdminOrEmployeePermissions,
} from '../middlewares/auth.middleware';

const router = Router();

router.get('/categories', requireAuth, getCategories);
router.post(
  '/categories',
  requireAuth,
  requireSuperAdminOrEmployeePermissions(['categories.create']),
  createCategory,
);
router.put(
  '/categories/:id',
  requireAuth,
  requireSuperAdminOrEmployeePermissions(['categories.update']),
  updateCategory,
);
router.delete(
  '/categories/:id',
  requireAuth,
  requireSuperAdminOrEmployeePermissions(['categories.delete']),
  deleteCategory,
);
router.get('/brands', getBrands);
router.get('/models/:brandId', getModels);
router.get('/icons', requireAuth, requirePortalOperator, getIcons);
router.post('/icons', createIcon);
router.get('/dealers', getApprovedDealers);
router.get('/finance-support', getFinanceSupportItems);
router.get('/hero-image', getHeroImage);
router.get('/inspection-section', getInspectionSection);
router.get('/public-listings', getPublicListings);
router.get('/public-listings/:id', getPublicListingById);
router.post('/public-listings/:id/view', incrementListingView);
router.get('/public-categories', getPublicCategories);
router.get('/public-search-filters', getPublicSearchFilters);
router.get('/recent-listings', getRecentListings);

export default router;
