import { Router } from 'express';
import { getNotifications, getPushConfig, markAsRead, markAllAsRead, savePushSubscription, saveFcmToken } from '../controllers/notification.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.get('/push-config', getPushConfig);

router.use(requireAuth);

router.get('/', getNotifications);
router.post('/push-subscription', savePushSubscription);
router.post('/fcm-token', saveFcmToken);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);

export default router;
