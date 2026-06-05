import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInAnonymously, type Auth, type User } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

export function getFirebaseClientConfig(): FirebaseClientConfig | null {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined,
  };

  const required = [
    config.apiKey,
    config.authDomain,
    config.projectId,
    config.storageBucket,
    config.messagingSenderId,
    config.appId,
  ];

  return required.every(Boolean) ? config : null;
}

export function canUseFirebaseAdapter() {
  return getFirebaseClientConfig() !== null;
}

export function getFirebaseClientApp(): FirebaseApp | null {
  const config = getFirebaseClientConfig();
  if (!config || typeof window === "undefined") return null;

  return getApps()[0] ?? initializeApp(config);
}

export function getFirebaseClientServices(): { app: FirebaseApp; auth: Auth; db: Firestore } | null {
  const app = getFirebaseClientApp();
  if (!app) return null;

  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };
}

export async function getFirebaseAnonymousUser(): Promise<User | null> {
  const services = getFirebaseClientServices();
  if (!services) return null;

  if (services.auth.currentUser) return services.auth.currentUser;

  const credential = await signInAnonymously(services.auth);
  return credential.user;
}
