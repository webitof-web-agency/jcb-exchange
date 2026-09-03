import webpush from 'web-push';
import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';
import admin, { isFirebaseAdminInitialized } from '../config/firebaseAdmin';
import {
  isExpiredPushSubscriptionError,
  normalizePushSubscription,
  PushSubscriptionPayload,
} from '../utils/pushSubscriptions';

// Ensure you have these variables in your .env
const publicVapidKey = process.env.VAPID_PUBLIC_KEY || '';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@jcbexchange.com';

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(subject, publicVapidKey, privateVapidKey);
} else {
  console.warn('VAPID keys are not set. Web Push notifications will not work.');
}

export class PushNotificationService {
  static getPublicConfig() {
    return {
      isEnabled: Boolean(publicVapidKey && privateVapidKey),
      publicKey: publicVapidKey || null,
    };
  }

  /**
   * Save an FCM token for a mobile device user
   */
  static async saveFcmToken(userId: string, fcmToken: string) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { fcmToken },
      });
      console.log(`✅ Saved FCM token for user ${userId}`);
      return { success: true };
    } catch (error) {
      console.error('Error saving FCM token:', error);
      throw error;
    }
  }

  /**
   * Save a web push subscription for a browser user
   */
  static async saveSubscription(userId: string, subscription: PushSubscriptionPayload) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          pushSubscription: normalizePushSubscription(subscription),
        },
      });
      console.log(`Saved push subscription for user ${userId}`);
      return { success: true };
    } catch (error) {
      console.error('Error saving subscription:', error);
      throw error;
    }
  }

  /**
   * Send a Web Push notification to a specific subscription object
   */
  static async sendNotification(subscription: webpush.PushSubscription, payload: unknown) {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      return { success: true };
    } catch (error) {
      console.error('Error sending web push notification:', error);
      throw error;
    }
  }

  /**
   * Send Firebase FCM Push Notification to a specific token
   */
  static async sendFcmNotification(fcmToken: string, payload: { title: string; body: string; data?: Record<string, string> }) {
    if (!isFirebaseAdminInitialized || !fcmToken) {
      return;
    }

    try {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
      });
      console.log(`📱 Real-time FCM push notification sent to token: ${fcmToken.substring(0, 15)}...`);
    } catch (error) {
      console.error('Error sending FCM push notification:', error);
    }
  }

  private static async clearSubscription(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { pushSubscription: Prisma.JsonNull },
    });
  }

  private static async sendToStoredSubscription(
    userId: string,
    subscription: webpush.PushSubscription,
    payload: unknown,
  ) {
    try {
      await this.sendNotification(subscription, payload);
    } catch (error) {
      if (isExpiredPushSubscriptionError(error)) {
        await this.clearSubscription(userId);
        return;
      }

      throw error;
    }
  }

  /**
   * Send a notification to a user (both Web Push and Mobile FCM)
   */
  static async sendToUser(userId: string, payload: any) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { pushSubscription: true, fcmToken: true }
      });

      if (!user) return;

      // 1. Web Push
      const subscription = user.pushSubscription as unknown as webpush.PushSubscription | null;
      if (subscription) {
        await this.sendToStoredSubscription(userId, subscription, payload).catch(e => console.error(e));
      }

      // 2. Mobile FCM Push Notification
      if (user.fcmToken) {
        const title = payload.title || 'JCB Exchange Notification';
        const body = payload.body || payload.message || '';
        const dataPath = payload.url || payload.path || payload.link || '/notifications';

        await this.sendFcmNotification(user.fcmToken, {
          title,
          body,
          data: { path: String(dataPath) },
        });
      }
    } catch (error) {
      console.error('Error sending push to user:', error);
    }
  }

  /**
   * Send a notification to multiple users efficiently
   */
  static async sendToUsers(userIds: string[], payload: any) {
    try {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, pushSubscription: true, fcmToken: true }
      });
      
      const promises = users.map((user: { id: string }) => this.sendToUser(user.id, payload));
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error sending push to users:', error);
    }
  }

  /**
   * Broadcast a notification (e.g., to all users for a new listing)
   */
  static async broadcastNewListing(listingTitle: string, listingId: string) {
    const payload = {
      title: 'New JCB Listing!',
      body: `Check out the newly added: ${listingTitle}`,
      icon: '/icon.png',
      url: `/machines/${listingId}`
    };

    try {
      const users = await prisma.user.findMany({
        select: { id: true }
      });
      
      const promises = users.map((user: { id: string }) => this.sendToUser(user.id, payload));
      await Promise.allSettled(promises);
      console.log(`Broadcasted new listing push notification to ${users.length} users`);
    } catch (error) {
      console.error('Error broadcasting push notification:', error);
    }
  }
}
