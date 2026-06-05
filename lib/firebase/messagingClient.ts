import type { Messaging } from "firebase/messaging";
import { getFirebaseClientApp } from "@/lib/firebase/client";

export async function getFirebaseMessagingClient(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;

  const app = getFirebaseClientApp();
  if (!app) return null;

  const { getMessaging, isSupported } = await import("firebase/messaging");
  if (!(await isSupported().catch(() => false))) return null;

  return getMessaging(app);
}
