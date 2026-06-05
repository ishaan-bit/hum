import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { buildFirebaseAdminDiagnostics, getFirebaseAdminEnv, hasFirebasePrivateKeyMarkers, sanitizeFirebaseAdminError } from "@/lib/firebase/adminCredentials";

export const OPS_MISSING_ENV_MESSAGE = "Missing FIREBASE_SERVICE_ACCOUNT_B64.";
export const OPS_ADMIN_INIT_MESSAGE = "Firebase Admin could not initialize. Check server environment variables and private key formatting.";

export class FirebaseAdminSetupError extends Error {
  constructor() {
    super(OPS_MISSING_ENV_MESSAGE);
    this.name = "FirebaseAdminSetupError";
  }
}

export class FirebaseAdminInitializationError extends Error {
  sanitizedError: { code: string; message: string };

  constructor(error: unknown) {
    super(OPS_ADMIN_INIT_MESSAGE);
    this.name = "FirebaseAdminInitializationError";
    this.sanitizedError = sanitizeFirebaseAdminError(error);
  }
}

function getAdminApp() {
  const existing = getApps()[0];
  if (existing) return existing;

  const { projectId, clientEmail, privateKey } = getFirebaseAdminEnv();

  if (!projectId || !clientEmail || !privateKey) {
    const error = new FirebaseAdminSetupError();
    console.error("[ops-firebase-admin]", buildFirebaseAdminDiagnostics());
    throw error;
  }

  const { hasBeginMarker, hasEndMarker } = hasFirebasePrivateKeyMarkers(privateKey);
  if (!hasBeginMarker || !hasEndMarker) {
    const initError = new FirebaseAdminSetupError();
    console.error("[ops-firebase-admin]", buildFirebaseAdminDiagnostics());
    throw initError;
  }

  try {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } catch (error) {
    const initError = new FirebaseAdminInitializationError(error);
    console.error("[ops-firebase-admin]", buildFirebaseAdminDiagnostics());
    throw initError;
  }
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export function getAdminMessaging() {
  return getMessaging(getAdminApp());
}

export function getFirebaseAdminDiagnostics() {
  return buildFirebaseAdminDiagnostics();
}

export function toFirebaseAdminFriendlyError(error: unknown) {
  if (error instanceof FirebaseAdminSetupError || error instanceof FirebaseAdminInitializationError) {
    return error;
  }
  const initError = new FirebaseAdminInitializationError(error);
  console.error("[ops-firebase-admin]", buildFirebaseAdminDiagnostics());
  return initError;
}
