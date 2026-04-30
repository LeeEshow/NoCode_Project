import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const credential = credJson
    ? admin.credential.cert(JSON.parse(credJson) as admin.ServiceAccount)
    : admin.credential.applicationDefault();

  admin.initializeApp({
    credential,
    projectId: process.env.FIRESTORE_PROJECT_ID,
  });
}

export const db = admin.firestore();
