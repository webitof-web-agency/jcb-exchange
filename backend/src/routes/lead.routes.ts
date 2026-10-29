import { Router } from 'express';
import {
  createLead,
  createPublicContactLead,
  getMyLeads,
  getMyLeadBadges,
  updateLeadStatus,
  getLeadById,
  addLeadActivity,
} from '../controllers/lead.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { publicLeadRateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

router.post('/', publicLeadRateLimit, createLead);
router.post('/public-contact', requireAuth, createPublicContactLead);
router.get('/my-leads', requireAuth, getMyLeads);
router.get('/badges', requireAuth, getMyLeadBadges);
router.get('/:id', requireAuth, getLeadById);
router.post('/:id/activities', requireAuth, addLeadActivity);
router.patch('/:id/status', requireAuth, updateLeadStatus);

export default router;

