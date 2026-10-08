import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error("A variável FIREBASE_SERVICE_ACCOUNT_JSON não está configurada.");
  }

  let serviceAccount: Record<string, string>;
  try {
    serviceAccount = JSON.parse(serviceAccountJson) as Record<string, string>;
  } catch (error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON não contém um JSON válido.", { cause: error });
  }

  return initializeApp({
    credential: cert(serviceAccount),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

export function getAdminServices() {
  const app = getAdminApp();
  return { adminAuth: getAuth(app), adminDb: getFirestore(app) };
}
