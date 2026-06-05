import { doc, setDoc } from "firebase/firestore";
import { HUM_APP_VERSION, forbiddenFirestoreHumFields } from "@/lib/firebase/humPayload";
import { getFirebaseAnonymousUser, getFirebaseClientServices } from "@/lib/firebase/client";
import { getFirebaseMessagingClient } from "@/lib/firebase/messagingClient";

export const HUM_NOTIFICATION_STATUS_KEY = "hum:notification-status:v1";
export const HUM_NOTIFICATION_PROMPT_DISMISSED_KEY = "hum:notification-prompt-dismissed:v1";

export type NotificationRegistrationDiagnostics = {
  supported: boolean;
  permission: NotificationPermission | "unsupported" | "unknown";
  vapidKeyPresent: boolean;
  serviceWorkerRegistered: boolean;
  messagingInitialized: boolean;
  authUidPresent: boolean;
  tokenRequested: boolean;
  tokenReceived: boolean;
  tokenStored: boolean;
  tokenDocPath: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastAttemptAt: string;
};

export type NotificationOptInAvailability = {
  supported: boolean;
  permission: NotificationRegistrationDiagnostics["permission"];
  vapidKeyPresent: boolean;
  tokenStored: boolean;
  setupFailed: boolean;
};

export type PushTokenPayload = {
  token: string;
  tokenHash: string;
  provider: "fcm";
  platform: "web";
  permission: "granted";
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  userAgentSummary: string | null;
  appVersion: string;
  vapidKeyVersion: string | null;
};

type MessagingTokenProvider = (options: {
  vapidKey: string;
  serviceWorkerRegistration: ServiceWorkerRegistration;
}) => Promise<string>;

type RegisterPushTokenDeps = {
  uid?: string | null;
  db?: unknown;
  getToken?: MessagingTokenProvider;
  writeToken?: (path: string, payload: PushTokenPayload) => Promise<void>;
  registerServiceWorker?: () => Promise<ServiceWorkerRegistration>;
  messagingSupported?: () => Promise<boolean>;
  requestPermission?: () => Promise<NotificationPermission>;
  getPermission?: () => NotificationPermission;
  now?: () => string;
  vapidKey?: string;
  appVersion?: string;
  vapidKeyVersion?: string | null;
};

type NotificationAvailabilityDeps = {
  getPermission?: () => NotificationPermission;
  vapidKey?: string;
  messagingSupported?: () => Promise<boolean>;
};

type NotificationRegistrationResult = {
  supported: boolean;
  permission: NotificationRegistrationDiagnostics["permission"];
  tokenStored: boolean;
  tokenPath: string | null;
};

export function canAttemptWebPushRegistration() {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getNotificationOptInAvailability(
  deps: NotificationAvailabilityDeps = {},
): Promise<NotificationOptInAvailability> {
  const vapidKey = deps.vapidKey ?? process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";
  const permission = getCurrentNotificationPermission(deps.getPermission);
  const browserSupported = canAttemptWebPushRegistration();
  const messagingSupported =
    browserSupported && (deps.messagingSupported === undefined ? await canUseFirebaseMessaging() : await deps.messagingSupported());

  return {
    supported: browserSupported && messagingSupported,
    permission: browserSupported ? permission : "unsupported",
    vapidKeyPresent: Boolean(vapidKey),
    tokenStored: readStoredTokenStatus(),
    setupFailed: readSetupFailedStatus(),
  };
}

export function shouldShowFirstOpenNotificationPrompt({
  supported,
  permission,
  vapidKeyPresent,
  dismissed,
}: NotificationOptInAvailability & { dismissed: boolean }) {
  return supported && permission === "default" && vapidKeyPresent && !dismissed;
}

export async function registerNotificationTokenAfterUserAction(
  deps: RegisterPushTokenDeps = {},
): Promise<NotificationRegistrationResult> {
  const now = deps.now?.() ?? new Date().toISOString();
  const getPermission = () => getCurrentNotificationPermission(deps.getPermission);
  const vapidKey = deps.vapidKey ?? process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";
  const vapidKeyPresent = Boolean(vapidKey);
  const baseDiagnostics = (): NotificationRegistrationDiagnostics => ({
    supported: canAttemptWebPushRegistration(),
    permission: getPermission(),
    vapidKeyPresent,
    serviceWorkerRegistered: false,
    messagingInitialized: false,
    authUidPresent: false,
    tokenRequested: false,
    tokenReceived: false,
    tokenStored: false,
    tokenDocPath: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastAttemptAt: now,
  });

  if (!canAttemptWebPushRegistration()) {
    writeNotificationDiagnostics({
      ...baseDiagnostics(),
      supported: false,
      permission: "unsupported",
    });
    return { supported: false, permission: "unsupported", tokenStored: false, tokenPath: null };
  }

  if (!vapidKey) {
    writeNotificationDiagnostics({
      ...baseDiagnostics(),
      lastErrorCode: "missing-vapid-key",
      lastErrorMessage: "Firebase VAPID key is not configured.",
    });
    return { supported: true, permission: getPermission(), tokenStored: false, tokenPath: null };
  }

  try {
    const messagingSupported =
      deps.messagingSupported === undefined ? await canUseFirebaseMessaging() : await deps.messagingSupported();
    if (!messagingSupported) {
      writeNotificationDiagnostics({
        ...baseDiagnostics(),
        lastErrorCode: "messaging-unsupported",
        lastErrorMessage: "Firebase Messaging is not supported in this browser.",
      });
      return { supported: false, permission: "unsupported", tokenStored: false, tokenPath: null };
    }

    const permission = await (deps.requestPermission?.() ?? Notification.requestPermission());
    if (permission !== "granted") {
      writeNotificationDiagnostics({
        ...baseDiagnostics(),
        permission,
      });
      return { supported: true, permission, tokenStored: false, tokenPath: null };
    }

    const services = getFirebaseClientServices();
    const user = deps.uid === undefined ? await getFirebaseAnonymousUser() : { uid: deps.uid };
    const uid = user?.uid;
    if (!uid) throw new Error("Notification token write requires an authenticated Firebase uid.");

    const serviceWorkerRegistration =
      deps.registerServiceWorker === undefined
        ? await registerFirebaseMessagingServiceWorker()
        : await deps.registerServiceWorker();
    const messagingInitialized = deps.getToken !== undefined || (await getFirebaseMessagingClient()) !== null;
    if (!messagingInitialized) throw new Error("Firebase Messaging is not supported in this browser.");

    writeNotificationDiagnostics({
      ...baseDiagnostics(),
      permission: "granted",
      serviceWorkerRegistered: true,
      messagingInitialized,
      authUidPresent: true,
      tokenRequested: true,
    });

    const token =
      deps.getToken === undefined
        ? await getDefaultFcmToken(vapidKey, serviceWorkerRegistration)
        : await deps.getToken({ vapidKey, serviceWorkerRegistration });
    if (!token) throw new Error("Firebase Messaging did not return a token.");

    writeNotificationDiagnostics({
      ...baseDiagnostics(),
      permission: "granted",
      serviceWorkerRegistered: true,
      messagingInitialized,
      authUidPresent: true,
      tokenRequested: true,
      tokenReceived: true,
    });

    const tokenHash = await buildPushTokenHash(token);
    const tokenId = tokenHash;
    const tokenPath = buildPushTokenPath(uid, tokenId);
    const payload = buildPushTokenPayload({
      token,
      tokenHash,
      now,
      appVersion: deps.appVersion ?? HUM_APP_VERSION,
      vapidKeyVersion: deps.vapidKeyVersion ?? buildVapidKeyVersion(vapidKey),
    });

    assertPushTokenPayloadSafe(payload);

    if (deps.writeToken) {
      await deps.writeToken(tokenPath, payload);
    } else {
      if (!services) throw new Error("Firebase is not configured.");
      await setDoc(doc(services.db, "users", uid, "pushTokens", tokenId), payload, { merge: true });
    }

    writeNotificationDiagnostics({
      ...baseDiagnostics(),
      permission: "granted",
      serviceWorkerRegistered: true,
      messagingInitialized,
      authUidPresent: true,
      tokenRequested: true,
      tokenReceived: true,
      tokenStored: true,
      tokenDocPath: tokenPath,
      lastErrorCode: null,
      lastErrorMessage: null,
    });

    return { supported: true, permission: "granted", tokenStored: true, tokenPath };
  } catch (error) {
    const existing = readNotificationDiagnostics();
    writeNotificationDiagnostics({
      ...baseDiagnostics(),
      serviceWorkerRegistered: existing?.serviceWorkerRegistered ?? false,
      messagingInitialized: existing?.messagingInitialized ?? false,
      authUidPresent: existing?.authUidPresent ?? false,
      tokenRequested: existing?.tokenRequested ?? false,
      tokenReceived: existing?.tokenReceived ?? false,
      lastErrorCode: classifyRegistrationError(error),
      lastErrorMessage: errorMessage(error),
    });
    return { supported: true, permission: getPermission(), tokenStored: false, tokenPath: null };
  }
}

export function buildPushTokenPath(uid: string, tokenId: string) {
  if (!uid) throw new Error("Push token path requires uid.");
  return `users/${uid}/pushTokens/${tokenId}`;
}

export function buildPushTokenPayload({
  token,
  tokenHash,
  now,
  appVersion,
  vapidKeyVersion,
}: {
  token: string;
  tokenHash: string;
  now: string;
  appVersion: string;
  vapidKeyVersion: string | null;
}): PushTokenPayload {
  return {
    token,
    tokenHash,
    provider: "fcm",
    platform: "web",
    permission: "granted",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    userAgentSummary: getSafeUserAgentSummary(),
    appVersion,
    vapidKeyVersion,
  };
}

export async function buildPushTokenHash(token: string) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return toBase64Url(new Uint8Array(digest));
  }

  return token.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 140);
}

export function assertPushTokenPayloadSafe(payload: Record<string, unknown>) {
  for (const field of forbiddenFirestoreHumFields) {
    if (field in payload) {
      throw new Error(`Forbidden push token field: ${field}`);
    }
  }
}

function writeNotificationDiagnostics(diagnostics: NotificationRegistrationDiagnostics) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HUM_NOTIFICATION_STATUS_KEY, JSON.stringify(diagnostics));
}

function getCurrentNotificationPermission(getPermission?: () => NotificationPermission) {
  if (getPermission) return getPermission();
  return typeof Notification === "undefined" ? "default" : Notification.permission;
}

async function canUseFirebaseMessaging() {
  return (await getFirebaseMessagingClient()) !== null;
}

function readStoredTokenStatus() {
  const parsed = readNotificationDiagnostics();
  return parsed?.permission === "granted" && parsed.tokenStored === true;
}

function readSetupFailedStatus() {
  const parsed = readNotificationDiagnostics();
  return Boolean(parsed?.lastErrorCode) && parsed?.tokenStored !== true;
}

function readNotificationDiagnostics(): Partial<NotificationRegistrationDiagnostics> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(HUM_NOTIFICATION_STATUS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<NotificationRegistrationDiagnostics>;
  } catch {
    return null;
  }
}

async function getDefaultFcmToken(vapidKey: string, serviceWorkerRegistration: ServiceWorkerRegistration) {
  const messaging = await getFirebaseMessagingClient();
  if (!messaging) throw new Error("Firebase Messaging is not supported in this browser.");

  const { getToken } = await import("firebase/messaging");
  return getToken(messaging, { vapidKey, serviceWorkerRegistration });
}

function registerFirebaseMessagingServiceWorker() {
  return navigator.serviceWorker.register("/firebase-messaging-sw.js");
}

function getSafeUserAgentSummary() {
  if (typeof navigator === "undefined") return null;

  const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? "unknown";
  const mobile = typeof nav.userAgentData?.mobile === "boolean" ? (nav.userAgentData.mobile ? "mobile" : "desktop") : null;
  const language = navigator.language || null;
  const browser = summarizeBrowser(navigator.userAgent);
  return [browser, platform, mobile, language].filter(Boolean).join(" | ").slice(0, 180);
}

function summarizeBrowser(userAgent: string) {
  if (!userAgent) return "unknown-browser";
  if (userAgent.includes("Edg/")) return "Edge";
  if (userAgent.includes("Chrome/")) return "Chrome";
  if (userAgent.includes("Firefox/")) return "Firefox";
  if (userAgent.includes("Safari/")) return "Safari";
  return "unknown-browser";
}

function buildVapidKeyVersion(vapidKey: string) {
  return vapidKey ? `vapid:${vapidKey.slice(0, 8)}` : null;
}

function toBase64Url(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Notification registration failed.";
}

function classifyRegistrationError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  if (message.includes("service worker")) return "service-worker-registration-failed";
  if (message.includes("uid") || message.includes("authenticated")) return "auth-uid-missing";
  if (message.includes("messaging")) return "messaging-initialization-failed";
  if (message.includes("token")) return "token-request-failed";
  return error instanceof Error ? "registration-failed" : "unknown-error";
}
