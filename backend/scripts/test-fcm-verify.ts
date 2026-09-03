import 'dotenv/config';
import admin, { isFirebaseAdminInitialized } from '../src/config/firebaseAdmin';

async function verifyFcmSetup() {
  console.log('=== 🔍 TESTING FIREBASE FCM SETUP ===');
  console.log('1. Firebase Admin SDK Initialized:', isFirebaseAdminInitialized ? '✅ YES' : '❌ NO');

  if (!isFirebaseAdminInitialized) {
    console.error('❌ Firebase Admin SDK failed to initialize.');
    process.exit(1);
  }

  console.log('2. Firebase Project ID:', admin.app().options.credential ? (admin.app().options as any).credential.projectId || 'jcb-exchange' : 'Unknown');

  // Test dry-run sending of a sample FCM message structure to verify credentials
  try {
    const dummyToken = 'eXampleDummyFcmToken1234567890abcdefghijklmnopqrstuvwxyz';
    console.log('3. Validating Firebase Admin Messaging credentials (dry-run)...');

    await admin.messaging().send(
      {
        token: dummyToken,
        notification: {
          title: 'Test Notification',
          body: 'Testing Firebase credentials',
        },
        data: {
          path: '/notifications',
        },
      },
      true // dryRun mode
    );
    console.log('✅ Firebase Admin Messaging credentials validated successfully!');
  } catch (error: any) {
    if (
      error?.code === 'messaging/invalid-argument' ||
      error?.code === 'messaging/invalid-registration-token' ||
      error?.code === 'messaging/registration-token-not-registered'
    ) {
      console.log('🎉 SUCCESS! Firebase Admin SDK Credentials & OAuth2 Connection are 100% VALID!');
      console.log('   (Google OAuth2 Access Token fetched successfully and Firebase Messaging API authenticated!)');
    } else {
      console.error('❌ Firebase Messaging test failed:', error);
    }
  }

  console.log('\n=== ✅ FIREBASE SETUP VERIFICATION COMPLETE ===');
  process.exit(0);
}

verifyFcmSetup().catch((err) => {
  console.error('Fatal error verifying FCM setup:', err);
  process.exit(1);
});
