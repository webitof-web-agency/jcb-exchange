import { Router } from 'express';
import { createLead, createPublicContactLead, getMyLeads, getMyLeadBadges, updateLeadStatus } from '../controllers/lead.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.post('/', createLead);
router.post('/public-contact', requireAuth, createPublicContactLead);
router.get('/my-leads', requireAuth, getMyLeads);
router.get('/badges', requireAuth, getMyLeadBadges);
router.patch('/:id/status', requireAuth, updateLeadStatus);

export default router;
