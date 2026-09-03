import 'dotenv/config';
import prisma from '../src/lib/prisma';
import { PushNotificationService } from '../src/services/pushNotification.service';
import { isFirebaseAdminInitialized } from '../src/config/firebaseAdmin';

async function sendTestPushNotification() {
  console.log('=== 🚀 TRIGGERING TEST PUSH NOTIFICATION ===');

  if (!isFirebaseAdminInitialized) {
    console.error('❌ Firebase Admin SDK is not initialized.');
    process.exit(1);
  }

  const tokenArg = process.argv[2]?.trim();

  if (tokenArg) {
    console.log(`📱 Sending direct test Push Notification to provided FCM token: ${tokenArg.substring(0, 20)}...`);
    await PushNotificationService.sendFcmNotification(tokenArg, {
      title: '🚜 JCB Exchange Test Push Notification',
      body: 'Success! Your mobile APK is connected and receiving real-time push notifications.',
      data: {
        path: '/notifications',
      },
    });
    console.log('\n=== ✅ TEST PUSH NOTIFICATION SENT SUCCESSFULLY ===');
    process.exit(0);
  }

  try {
    const usersWithTokens = await prisma.user.findMany({
      where: {
        fcmToken: {
          not: null,
        },
      },
      select: {
        id: true,
        name: true,
        mobile: true,
        email: true,
        role: true,
        fcmToken: true,
      },
    });

    console.log(`Found ${usersWithTokens.length} user(s) with registered FCM tokens in Database.\n`);

    if (usersWithTokens.length === 0) {
      console.log('⚠️ No registered FCM tokens found in Database yet.');
      console.log('📱 ACTION: Open the JCB Exchange Mobile APK on your phone/emulator and log in.');
      console.log('   Or run: npx tsx scripts/send-test-push.ts <YOUR_FCM_TOKEN>');
      process.exit(0);
    }

    for (const user of usersWithTokens) {
      console.log(`📱 Sending test Push Notification to User: ${user.name || user.mobile || user.email} (${user.role})...`);

      await PushNotificationService.sendFcmNotification(user.fcmToken!, {
        title: '🚜 JCB Exchange Test Push Notification',
        body: 'Success! Your mobile APK is connected and receiving real-time push notifications.',
        data: {
          path: '/notifications',
        },
      });
    }
  } catch (error: any) {
    console.warn('⚠️ Could not query database:', error?.message || error);
    console.log('\n💡 TIP: You can test sending directly to a specific device FCM token by running:');
    console.log('   npx tsx scripts/send-test-push.ts <FCM_TOKEN>');
  }

  process.exit(0);
}

sendTestPushNotification().catch((err) => {
  console.error('Fatal error sending test push notification:', err);
  process.exit(1);
});
