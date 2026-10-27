import { Router } from 'express';
import {
  getNotifications,
  getPushConfig,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotifications,
  savePushSubscription,
  saveFcmToken,
  streamNotifications,
} from '../controllers/notification.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.get('/push-config', getPushConfig);

router.use(requireAuth);

router.get('/stream', streamNotifications);
router.get('/', getNotifications);
router.post('/push-subscription', savePushSubscription);
router.post('/fcm-token', saveFcmToken);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);
router.delete('/', clearNotifications);

export default router;
