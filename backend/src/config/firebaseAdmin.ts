import fs from 'fs';
import path from 'path';

type FirebaseAdminModule = {
  apps: Array<unknown>;
  credential: {
    cert: (serviceAccount: unknown) => unknown;
  };
  initializeApp: (options: { credential: unknown }) => void;
  messaging: () => {
    send: (message: unknown) => Promise<unknown>;
  };
};

let firebaseAdmin: FirebaseAdminModule | null = null;
let isFirebaseAdminInitialized = false;

try {
  // Load Firebase only when the dependency actually exists on disk.
  const firebaseAdminModule = require('firebase-admin') as FirebaseAdminModule;
  firebaseAdmin = firebaseAdminModule;

  if (firebaseAdmin.apps.length === 0) {
    let serviceAccount: unknown = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (error) {
        console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT env JSON:', error);
      }
    }

    if (!serviceAccount) {
      const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(process.cwd(), 'serviceAccountKey.json');
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          serviceAccount = JSON.parse(content);
        } catch (error) {
          console.warn(`Failed to read Firebase service account at ${filePath}:`, error);
        }
      }
    }

    if (serviceAccount) {
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount),
      });
      isFirebaseAdminInitialized = true;
      console.log('Firebase Admin SDK initialized successfully');
    } else {
      console.warn('Firebase Admin SDK not initialized: FIREBASE_SERVICE_ACCOUNT or serviceAccountKey.json not provided.');
    }
  } else {
    isFirebaseAdminInitialized = true;
  }
} catch (error) {
  console.warn('Firebase Admin SDK unavailable. Mobile push notifications are disabled until dependencies are installed.', error);
}

export { isFirebaseAdminInitialized };
export default firebaseAdmin;
