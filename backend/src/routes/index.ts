import { Router } from 'express';
import masterRoutes from './master.routes';
import authRoutes from './auth.routes';
import documentRoutes from './document.routes';
import listingRoutes from './listing.routes';
import leadRoutes from './lead.routes';
import analyticsRoutes from './analytics.routes';
import superAdminRoutes from './superadmin.routes';
import notificationRoutes from './notification.routes';

const router = Router();

router.use('/master', masterRoutes);
router.use('/auth', authRoutes);
router.use('/documents', documentRoutes);
router.use('/superadmin', superAdminRoutes);
router.use('/listings', listingRoutes);
router.use('/leads', leadRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/notifications', notificationRoutes);

export default router;
