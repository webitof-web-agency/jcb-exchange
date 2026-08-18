import { Router } from 'express';
import {
  createListing,
  deleteListing,
  getListingById,
  getListings,
  updateListing,
  updateListingStatus,
  updateListingAvailability,
} from '../controllers/listing.controller';
import { requireAuth, requireAdmin } from '../middlewares/auth.middleware';

const router = Router();

router.post('/', requireAuth, createListing);
router.get('/', requireAuth, getListings);
router.get('/:id', requireAuth, getListingById);
router.put('/:id', requireAuth, updateListing);
router.delete('/:id', requireAuth, deleteListing);
router.patch('/:id/status', requireAuth, requireAdmin, updateListingStatus);
router.patch('/:id/availability', requireAuth, updateListingAvailability);

export default router;
