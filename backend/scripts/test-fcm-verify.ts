import 'dotenv/config';
import admin, { isFirebaseAdminInitialized } from '../src/config/firebaseAdmin';

async function verifyFcmSetup() {
  console.log('=== TESTING FIREBASE FCM SETUP ===');
  console.log('1. Firebase Admin SDK Initialized:', isFirebaseAdminInitialized ? 'YES' : 'NO');

  if (!isFirebaseAdminInitialized || !admin) {
    console.error('Firebase Admin SDK failed to initialize.');
    process.exit(1);
  }

  console.log('2. Firebase App Count:', admin.apps.length);

  try {
    const dummyToken = 'eXampleDummyFcmToken1234567890abcdefghijklmnopqrstuvwxyz';
    console.log('3. Validating Firebase Admin Messaging credentials...');

    await admin.messaging().send({
      token: dummyToken,
      notification: {
        title: 'Test Notification',
        body: 'Testing Firebase credentials',
      },
      data: {
        path: '/notifications',
      },
    });

    console.log('Firebase Admin Messaging credentials validated successfully.');
  } catch (error: unknown) {
    const firebaseError = error as { code?: string };

    if (
      firebaseError?.code === 'messaging/invalid-argument' ||
      firebaseError?.code === 'messaging/invalid-registration-token' ||
      firebaseError?.code === 'messaging/registration-token-not-registered'
    ) {
      console.log('Firebase Admin SDK credentials and Firebase Messaging connection are valid.');
    } else {
      console.error('Firebase Messaging test failed:', error);
    }
  }

  console.log('\n=== FIREBASE SETUP VERIFICATION COMPLETE ===');
  process.exit(0);
}

verifyFcmSetup().catch((error) => {
  console.error('Fatal error verifying FCM setup:', error);
  process.exit(1);
});
