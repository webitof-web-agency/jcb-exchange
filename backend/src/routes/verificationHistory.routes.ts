import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { listVerificationHistory, VerificationHistoryError, type VerificationHistoryGroup } from '../services/verificationHistory.service';

// Combined, paginated verification history for Identity Hub (identity) and Vehicle & Transport
// (vehicle). Each verification type is included only when the viewer may read its own history.
const router = Router();

router.get('/:group', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const group = String(req.params.group || '');
    if (group !== 'identity' && group !== 'vehicle') {
      return res.status(404).json({ success: false, error: 'Unknown verification history.' });
    }
    if (!['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(req.user!.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required.' });
    }
    const result = await listVerificationHistory(group as VerificationHistoryGroup, req.query as Record<string, unknown>, { id: req.user!.id, role: req.user!.role });
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof VerificationHistoryError) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    next(error);
  }
});

export default router;
