import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId:  process.env.FIRESTORE_PROJECT_ID,
  });
}

export const db = admin.firestore();
