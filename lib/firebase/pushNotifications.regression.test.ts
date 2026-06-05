import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  HUM_NOTIFICATION_STATUS_KEY,
  assertPushTokenPayloadSafe,
  buildPushTokenPayload,
  buildPushTokenPath,
  getNotificationOptInAvailability,
  registerNotificationTokenAfterUserAction,
  shouldShowFirstOpenNotificationPrompt,
} from "./pushNotifications";

test("unsupported browser path returns without storing a token", async () => {
  const result = await registerNotificationTokenAfterUserAction({
    uid: "uid-1",
    vapidKey: "test-vapid",
    getToken: async () => "token",
    writeToken: async () => assert.fail("unsupported browsers must not write tokens"),
  });

  assert.equal(result.supported, false);
  assert.equal(result.tokenStored, false);
  assert.equal(result.tokenPath, null);
});

test("permission denied path stores no token", async () => {
  installBrowserPushGlobals();
  const result = await registerNotificationTokenAfterUserAction({
    uid: "uid-1",
    vapidKey: "test-vapid",
    messagingSupported: async () => true,
    requestPermission: async () => "denied",
    getPermission: () => "denied",
    getToken: async () => assert.fail("denied permission must not request an FCM token"),
    writeToken: async () => assert.fail("denied permission must not write tokens"),
  });

  assert.equal(result.supported, true);
  assert.equal(result.permission, "denied");
  assert.equal(result.tokenStored, false);
});

test("notification availability does not request browser permission", async () => {
  installBrowserPushGlobals();
  let permissionRequests = 0;
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: {
      permission: "default",
      requestPermission: async () => {
        permissionRequests += 1;
        return "granted";
      },
    },
  });

  const result = await getNotificationOptInAvailability({
    vapidKey: "test-vapid",
    messagingSupported: async () => true,
  });

  assert.equal(result.supported, true);
  assert.equal(result.permission, "default");
  assert.equal(result.vapidKeyPresent, true);
  assert.equal(permissionRequests, 0);
});

test("first-open prompt requires default permission, support, VAPID key, and no dismissal", () => {
  assert.equal(
    shouldShowFirstOpenNotificationPrompt({
      supported: true,
      permission: "default",
      vapidKeyPresent: true,
      tokenStored: false,
      setupFailed: false,
      dismissed: false,
    }),
    true,
  );
  assert.equal(
    shouldShowFirstOpenNotificationPrompt({
      supported: true,
      permission: "default",
      vapidKeyPresent: true,
      tokenStored: false,
      setupFailed: false,
      dismissed: true,
    }),
    false,
  );
  assert.equal(
    shouldShowFirstOpenNotificationPrompt({
      supported: true,
      permission: "denied",
      vapidKeyPresent: true,
      tokenStored: false,
      setupFailed: false,
      dismissed: false,
    }),
    false,
  );
  assert.equal(
    shouldShowFirstOpenNotificationPrompt({
      supported: true,
      permission: "default",
      vapidKeyPresent: false,
      tokenStored: false,
      setupFailed: false,
      dismissed: false,
    }),
    false,
  );
});

test("granted permission stores token payload under users/{uid}/pushTokens/{tokenId}", async () => {
  installBrowserPushGlobals();
  const writes: Array<{ path: string; payload: ReturnType<typeof buildPushTokenPayload> }> = [];
  const result = await registerNotificationTokenAfterUserAction({
    uid: "uid-1",
    vapidKey: "test-vapid",
    messagingSupported: async () => true,
    requestPermission: async () => "granted",
    getPermission: () => "granted",
    getToken: async () => "fcm-token",
    writeToken: async (path, payload) => {
      writes.push({ path, payload });
    },
    now: () => "2026-06-04T10:00:00.000Z",
    appVersion: "0.1.0",
  });

  assert.equal(result.supported, true);
  assert.equal(result.permission, "granted");
  assert.equal(result.tokenStored, true);
  assert.equal(writes.length, 1);
  assert.match(writes[0].path, /^users\/uid-1\/pushTokens\/[A-Za-z0-9_-]+$/);
  assert.equal(writes[0].payload.provider, "fcm");
  assert.equal(writes[0].payload.platform, "web");
  assert.equal(writes[0].payload.source, "web");
  assert.equal(writes[0].payload.permission, "granted");
});

test("native Android permission stores FCM token under users/{uid}/pushTokens/{tokenId}", async () => {
  const storage = installBrowserPushGlobals();
  const writes: Array<{ path: string; payload: ReturnType<typeof buildPushTokenPayload> }> = [];
  const result = await registerNotificationTokenAfterUserAction({
    uid: "uid-android",
    isAndroidNative: async () => true,
    nativePushAvailable: async () => true,
    checkNativePermission: async () => "prompt",
    requestNativePermission: async () => "granted",
    getNativeToken: async () => "android-fcm-token",
    writeToken: async (path, payload) => {
      writes.push({ path, payload });
    },
    now: () => "2026-06-04T10:00:00.000Z",
    appVersion: "0.1.1",
    buildVersion: "2",
  });

  const diagnostics = JSON.parse(storage.getItem(HUM_NOTIFICATION_STATUS_KEY) ?? "{}");
  assert.equal(result.supported, true);
  assert.equal(result.permission, "granted");
  assert.equal(result.tokenStored, true);
  assert.match(result.tokenPath ?? "", /^users\/uid-android\/pushTokens\/[A-Za-z0-9_-]+$/);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, result.tokenPath);
  assert.equal(writes[0].payload.provider, "fcm");
  assert.equal(writes[0].payload.platform, "android");
  assert.equal(writes[0].payload.permission, "granted");
  assert.equal(writes[0].payload.source, "native");
  assert.equal(writes[0].payload.appVersion, "0.1.1");
  assert.equal(writes[0].payload.buildVersion, "2");
  assert.equal(JSON.stringify(writes[0].payload).includes("rawAudio"), false);
  assert.equal(diagnostics.platform, "android");
  assert.equal(diagnostics.nativePushAvailable, true);
  assert.equal(diagnostics.androidPermission, "granted");
  assert.equal(diagnostics.tokenReceived, true);
  assert.equal(diagnostics.tokenStored, true);
  assert.equal(diagnostics.tokenDocPath, result.tokenPath);
  assert.equal(JSON.stringify(diagnostics).includes("android-fcm-token"), false);
});

test("native Android denied permission stores no token and records state", async () => {
  const storage = installBrowserPushGlobals();
  const result = await registerNotificationTokenAfterUserAction({
    uid: "uid-android",
    isAndroidNative: async () => true,
    nativePushAvailable: async () => true,
    checkNativePermission: async () => "prompt",
    requestNativePermission: async () => "denied",
    getNativeToken: async () => assert.fail("denied native permission must not request an FCM token"),
    writeToken: async () => assert.fail("denied native permission must not write tokens"),
    now: () => "2026-06-04T10:00:00.000Z",
  });

  const diagnostics = JSON.parse(storage.getItem(HUM_NOTIFICATION_STATUS_KEY) ?? "{}");
  assert.equal(result.supported, true);
  assert.equal(result.permission, "denied");
  assert.equal(result.tokenStored, false);
  assert.equal(diagnostics.platform, "android");
  assert.equal(diagnostics.nativePushAvailable, true);
  assert.equal(diagnostics.androidPermission, "denied");
  assert.equal(diagnostics.tokenRequested, false);
  assert.equal(diagnostics.tokenReceived, false);
  assert.equal(diagnostics.tokenStored, false);
});

test("native Android unavailable path does not break the app", async () => {
  const storage = installBrowserPushGlobals();
  const result = await registerNotificationTokenAfterUserAction({
    uid: "uid-android",
    isAndroidNative: async () => true,
    nativePushAvailable: async () => false,
    getNativeToken: async () => assert.fail("unavailable native push must not request a token"),
    writeToken: async () => assert.fail("unavailable native push must not write tokens"),
    now: () => "2026-06-04T10:00:00.000Z",
  });

  const diagnostics = JSON.parse(storage.getItem(HUM_NOTIFICATION_STATUS_KEY) ?? "{}");
  assert.equal(result.supported, false);
  assert.equal(result.permission, "unsupported");
  assert.equal(result.tokenStored, false);
  assert.equal(diagnostics.platform, "android");
  assert.equal(diagnostics.nativePushAvailable, false);
  assert.equal(diagnostics.lastErrorCode, "native-push-unavailable");
});

test("native Android availability does not require a web VAPID key", async () => {
  const result = await getNotificationOptInAvailability({
    isAndroidNative: async () => true,
    nativePushAvailable: async () => true,
    checkNativePermission: async () => "prompt",
    vapidKey: "",
  });

  assert.equal(result.supported, true);
  assert.equal(result.permission, "default");
  assert.equal(result.vapidKeyPresent, true);
});

test("registration diagnostics include debug-safe VAPID and token status", async () => {
  const storage = installBrowserPushGlobals();
  await registerNotificationTokenAfterUserAction({
    uid: "uid-1",
    vapidKey: "test-vapid",
    messagingSupported: async () => true,
    requestPermission: async () => "denied",
    getPermission: () => "denied",
    getToken: async () => assert.fail("denied permission must not request an FCM token"),
    writeToken: async () => assert.fail("denied permission must not write tokens"),
    now: () => "2026-06-04T10:00:00.000Z",
  });

  const diagnostics = JSON.parse(storage.getItem(HUM_NOTIFICATION_STATUS_KEY) ?? "{}");
  assert.equal(diagnostics.supported, true);
  assert.equal(diagnostics.permission, "denied");
  assert.equal(diagnostics.vapidKeyPresent, true);
  assert.equal(diagnostics.serviceWorkerRegistered, false);
  assert.equal(diagnostics.messagingInitialized, false);
  assert.equal(diagnostics.authUidPresent, false);
  assert.equal(diagnostics.tokenRequested, false);
  assert.equal(diagnostics.tokenReceived, false);
  assert.equal(diagnostics.tokenStored, false);
  assert.equal(diagnostics.tokenDocPath, null);
  assert.equal(diagnostics.lastAttemptAt, "2026-06-04T10:00:00.000Z");
});

test("missing VAPID key records a safe disabled state", async () => {
  const storage = installBrowserPushGlobals();
  const result = await registerNotificationTokenAfterUserAction({
    uid: "uid-1",
    vapidKey: "",
    requestPermission: async () => assert.fail("missing VAPID key must not request permission"),
    getPermission: () => "default",
    getToken: async () => assert.fail("missing VAPID key must not request an FCM token"),
    writeToken: async () => assert.fail("missing VAPID key must not write tokens"),
    now: () => "2026-06-04T10:00:00.000Z",
  });

  const diagnostics = JSON.parse(storage.getItem(HUM_NOTIFICATION_STATUS_KEY) ?? "{}");
  assert.equal(result.tokenStored, false);
  assert.equal(diagnostics.lastErrorCode, "missing-vapid-key");
  assert.equal(diagnostics.vapidKeyPresent, false);
});

test("token payload excludes raw audio fields", () => {
  const payload = buildPushTokenPayload({
    token: "fcm-token",
    tokenHash: "token-id",
    now: "2026-06-04T10:00:00.000Z",
    appVersion: "0.1.0",
    vapidKeyVersion: "v1",
  });

  assertPushTokenPayloadSafe(payload);
  assert.equal(Object.hasOwn(payload, "rawAudio"), false);
  assert.equal(Object.hasOwn(payload, "audioBlob"), false);
});

test("native token payload excludes raw audio fields", () => {
  const payload = buildPushTokenPayload({
    token: "android-fcm-token",
    tokenHash: "token-id",
    now: "2026-06-04T10:00:00.000Z",
    appVersion: "0.1.1",
    vapidKeyVersion: null,
    platform: "android",
    source: "native",
    buildVersion: "2",
    deviceInfo: { userAgentSummary: "Capacitor | Android", language: "en-US", standalone: true },
  });

  assertPushTokenPayloadSafe(payload);
  assert.equal(payload.platform, "android");
  assert.equal(payload.source, "native");
  assert.equal(Object.hasOwn(payload, "rawAudio"), false);
  assert.equal(Object.hasOwn(payload, "audioBlob"), false);
});

test("service worker registration failure records a diagnostic", async () => {
  const storage = installBrowserPushGlobals();
  const result = await registerNotificationTokenAfterUserAction({
    uid: "uid-1",
    vapidKey: "test-vapid",
    messagingSupported: async () => true,
    requestPermission: async () => "granted",
    getPermission: () => "granted",
    registerServiceWorker: async () => {
      throw new Error("Service worker registration failed.");
    },
    getToken: async () => assert.fail("token must not be requested without a service worker"),
    writeToken: async () => assert.fail("service worker failure must not write tokens"),
    now: () => "2026-06-04T10:00:00.000Z",
  });

  const diagnostics = JSON.parse(storage.getItem(HUM_NOTIFICATION_STATUS_KEY) ?? "{}");
  assert.equal(result.tokenStored, false);
  assert.equal(diagnostics.lastErrorCode, "service-worker-registration-failed");
  assert.equal(diagnostics.serviceWorkerRegistered, false);
  assert.equal(diagnostics.tokenRequested, false);
});

test("token received diagnostic includes token document path but not token value", async () => {
  const storage = installBrowserPushGlobals();
  await registerNotificationTokenAfterUserAction({
    uid: "uid-1",
    vapidKey: "test-vapid",
    messagingSupported: async () => true,
    requestPermission: async () => "granted",
    getPermission: () => "granted",
    getToken: async () => "fcm-token",
    writeToken: async () => undefined,
    now: () => "2026-06-04T10:00:00.000Z",
  });

  const rawDiagnostics = storage.getItem(HUM_NOTIFICATION_STATUS_KEY) ?? "";
  const diagnostics = JSON.parse(rawDiagnostics);
  assert.equal(diagnostics.authUidPresent, true);
  assert.equal(diagnostics.platform, "web");
  assert.equal(diagnostics.nativePushAvailable, false);
  assert.equal(diagnostics.androidPermission, null);
  assert.equal(diagnostics.serviceWorkerRegistered, true);
  assert.equal(diagnostics.messagingInitialized, true);
  assert.equal(diagnostics.tokenRequested, true);
  assert.equal(diagnostics.tokenReceived, true);
  assert.equal(diagnostics.tokenStored, true);
  assert.match(diagnostics.tokenDocPath, /^users\/uid-1\/pushTokens\/[A-Za-z0-9_-]+$/);
  assert.equal(rawDiagnostics.includes("fcm-token"), false);
});

test("token path is users/{uid}/pushTokens/{tokenId}", () => {
  assert.equal(buildPushTokenPath("uid-1", "token-id"), "users/uid-1/pushTokens/token-id");
});

test("token write requires uid", async () => {
  installBrowserPushGlobals();
  const result = await registerNotificationTokenAfterUserAction({
    uid: null,
    vapidKey: "test-vapid",
    messagingSupported: async () => true,
    requestPermission: async () => "granted",
    getPermission: () => "granted",
    getToken: async () => "fcm-token",
    writeToken: async () => assert.fail("missing uid must not write tokens"),
  });

  assert.equal(result.tokenStored, false);
  assert.equal(result.tokenPath, null);
});

test("service worker config file exists", () => {
  assert.equal(existsSync(resolve(process.cwd(), "public/firebase-messaging-sw.js")), true);
});

test("service worker opens the notification URL on click", () => {
  const worker = readFileSync(resolve(process.cwd(), "public/firebase-messaging-sw.js"), "utf8");

  assert.match(worker, /notificationclick/);
  assert.match(worker, /event\.notification\.data\?\.url/);
  assert.match(worker, /clients\.openWindow\(url\)/);
});

test("foreground notification listener shows in-app pushes", () => {
  const source = readFileSync(resolve(process.cwd(), "components/app/ForegroundNotificationListener.tsx"), "utf8");

  assert.match(source, /onMessage/);
  assert.match(source, /foreground-notification-toast/);
  assert.match(source, /payload\.data\?\.url/);
});

test("Firestore rules include owner-scoped push token writes", () => {
  const rules = existsSync(resolve(process.cwd(), "firestore.rules"))
    ? readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8")
    : "";

  assert.match(rules, /match \/pushTokens\/\{tokenId\}/);
  assert.match(rules, /request\.auth != null && request\.auth\.uid == userId/);
});

function installBrowserPushGlobals() {
  const storage = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
    removeItem(key: string) {
      storage.delete(key);
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      PushManager: function PushManager() {},
      Notification: {
        permission: "default",
        requestPermission: async () => "default",
      },
      localStorage,
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      serviceWorker: {
        register: async () => ({ scope: "/firebase-cloud-messaging-push-scope" }),
      },
      platform: "test",
      language: "en-US",
      userAgent: "Mozilla/5.0 Chrome/120",
    },
  });
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: {
      permission: "default",
      requestPermission: async () => "default",
    },
  });

  return localStorage;
}
