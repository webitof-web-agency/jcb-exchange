import { Router } from 'express';
import { getRcFull, getRcFullDetail, verifyRcFull } from '../controllers/rcFull.controller';
import { requireAdmin, requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['rc.full.read']);

router.use(requireAuth, requireAdmin);
router.post('/verify', canView, verifyRcFull);
router.get('/history', canView, getRcFull);
router.get('/history/:id', canView, getRcFullDetail);

export default router;
