import webpush from 'web-push';
import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';
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
  console.warn('VAPID keys are not set. Push notifications will not work.');
}

export class PushNotificationService {
  static getPublicConfig() {
    return {
      isEnabled: Boolean(publicVapidKey && privateVapidKey),
      publicKey: publicVapidKey || null,
    };
  }

  /**
   * Save a push subscription for a user
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
   * Send a push notification to a specific subscription object
   */
  static async sendNotification(subscription: webpush.PushSubscription, payload: unknown) {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      return { success: true };
    } catch (error) {
      console.error('Error sending push notification:', error);
      throw error;
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
   * Send a notification to a user by fetching their subscription from the DB
   */
  static async sendToUser(userId: string, payload: unknown) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { pushSubscription: true }
      });
      const subscription = user?.pushSubscription as unknown as webpush.PushSubscription | null;
      if (subscription) {
        await this.sendToStoredSubscription(userId, subscription, payload);
      }
    } catch (error) {
      console.error('Error sending push to user:', error);
    }
  }

  /**
   * Send a notification to multiple users efficiently
   */
  static async sendToUsers(userIds: string[], payload: unknown) {
    try {
      const users = await prisma.user.findMany({
        where: { 
          id: { in: userIds },
          pushSubscription: { not: Prisma.AnyNull } 
        },
        select: { id: true, pushSubscription: true }
      });
      
      const promises = users.map(user => {
        const sub = user.pushSubscription as unknown as webpush.PushSubscription;
        if (sub) {
          return this.sendToStoredSubscription(user.id, sub, payload).catch(e => console.error(e));
        }
        return Promise.resolve();
      });
      
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error sending push to users:', error);
    }
  }

  /**
   * Broadcast a notification (e.g., to all admins or subscribers for a new listing)
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
        where: {
          pushSubscription: { not: Prisma.AnyNull },
        },
        select: { id: true, pushSubscription: true }
      });
      
      const promises = users.map(user => {
        const sub = user.pushSubscription as unknown as webpush.PushSubscription;
        if (sub) {
          return this.sendToStoredSubscription(user.id, sub, payload).catch(e => console.error(e));
        }
        return Promise.resolve();
      });
      
      await Promise.allSettled(promises);
      console.log(`Broadcasted new listing push notification to ${users.length} users`);
    } catch (error) {
      console.error('Error broadcasting push notification:', error);
    }
  }
}
