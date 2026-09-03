import * as admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

let isFirebaseAdminInitialized = false;

try {
  if (admin.apps.length === 0) {
    let serviceAccount: any = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (err) {
        console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT env JSON:', err);
      }
    }

    if (!serviceAccount) {
      const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(process.cwd(), 'serviceAccountKey.json');
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          serviceAccount = JSON.parse(content);
        } catch (err) {
          console.warn(`Failed to read Firebase service account at ${filePath}:`, err);
        }
      }
    }

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      isFirebaseAdminInitialized = true;
      console.log('✅ Firebase Admin SDK initialized successfully');
    } else {
      console.warn('⚠️ Firebase Admin SDK not initialized: FIREBASE_SERVICE_ACCOUNT or serviceAccountKey.json not provided.');
    }
  } else {
    isFirebaseAdminInitialized = true;
  }
} catch (error) {
  console.error('Failed to initialize Firebase Admin SDK:', error);
}

export { isFirebaseAdminInitialized };
export default admin;
