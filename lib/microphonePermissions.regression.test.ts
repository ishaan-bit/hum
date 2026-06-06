import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  HUM_MICROPHONE_STATUS_KEY,
  getMicrophoneSettingsCopy,
  requestMicrophonePermissionAfterUserAction,
  shouldShowFirstOpenMicrophonePrompt,
} from "./microphonePermissions";

test("first-run microphone prompt appears before notification prompt wiring", () => {
  const source = readFileSync(resolve(process.cwd(), "components/app/SettingsPanel.tsx"), "utf8");
  const micPromptIndex = source.indexOf("<FirstOpenMicrophonePrompt");
  const notificationPromptIndex = source.indexOf("<FirstOpenNotificationPrompt");

  assert.ok(micPromptIndex > -1);
  assert.ok(notificationPromptIndex > -1);
  assert.ok(micPromptIndex < notificationPromptIndex);
  assert.match(source, /microphoneGateComplete/);
  assert.match(source, /if \(!microphoneGateComplete \|\| walkthroughOpen\) return/);
});

test("microphone first-run prompt renders required copy and actions", () => {
  const source = readFileSync(resolve(process.cwd(), "components/app/SettingsPanel.tsx"), "utf8");

  assert.match(source, /Microphone access is needed/);
  assert.match(source, /Hum works by listening to a short hum/);
  assert.match(source, /Audio stays local while Hum reads the shape of your voice/);
  assert.match(source, /Allow microphone/);
  assert.match(source, /Not now/);
});

test("Settings Data microphone control renders near notification control", () => {
  const source = readFileSync(resolve(process.cwd(), "components/app/SettingsPanel.tsx"), "utf8");

  assert.match(source, /activeSection === "data"[\s\S]*<MicrophonePermissionCard[\s\S]*<NotificationOptInCard/);
});

test("microphone settings copy covers not asked, granted, denied, and unsupported states", () => {
  assert.deepEqual(getMicrophoneSettingsCopy(null), {
    title: "Enable microphone",
    body: "Hum needs microphone access to record your hum.",
    buttonLabel: "Enable microphone",
    buttonDisabled: false,
  });
  assert.equal(getMicrophoneSettingsCopy(status("granted")).title, "Microphone enabled");
  assert.equal(getMicrophoneSettingsCopy(status("granted")).body, "Hum can record your short hums on this device.");
  assert.equal(getMicrophoneSettingsCopy(status("denied")).title, "Microphone blocked");
  assert.match(getMicrophoneSettingsCopy(status("denied")).body, /Android settings are blocking microphone access/);
  assert.equal(getMicrophoneSettingsCopy(status("unsupported")).title, "Microphone unavailable");
});

test("getUserMedia test stream is stopped after permission check", async () => {
  const storage = installLocalStorage();
  let stopped = false;
  const result = await requestMicrophonePermissionAfterUserAction({
    getUserMediaSupported: () => true,
    getUserMedia: async () => ({
      getTracks: () => [{ stop: () => { stopped = true; } }],
    }),
    queryBrowserPermission: async () => "prompt",
    now: () => "2026-06-06T10:00:00.000Z",
  });

  const diagnostics = JSON.parse(storage.getItem(HUM_MICROPHONE_STATUS_KEY) ?? "{}");
  assert.equal(result.permissionGranted, true);
  assert.equal(stopped, true);
  assert.equal(diagnostics.permissionGranted, true);
});

test("microphone diagnostics do not contain audio data", async () => {
  const storage = installLocalStorage();
  await requestMicrophonePermissionAfterUserAction({
    getUserMediaSupported: () => true,
    getUserMedia: async () => ({
      getTracks: () => [{ stop: () => undefined }],
    }),
    queryBrowserPermission: async () => "prompt",
  });

  const rawDiagnostics = storage.getItem(HUM_MICROPHONE_STATUS_KEY) ?? "";
  assert.equal(rawDiagnostics.includes("rawAudio"), false);
  assert.equal(rawDiagnostics.includes("audioBlob"), false);
  assert.equal(rawDiagnostics.includes("blob"), false);
});

test("Android platform uses native permission path if available", async () => {
  installLocalStorage();
  let nativeRequested = false;
  let getUserMediaCalled = false;
  const result = await requestMicrophonePermissionAfterUserAction({
    isAndroidNative: async () => true,
    checkNativePermission: async () => "prompt",
    requestNativePermission: async () => {
      nativeRequested = true;
      return "granted";
    },
    getUserMediaSupported: () => true,
    getUserMedia: async () => {
      getUserMediaCalled = true;
      return { getTracks: () => [{ stop: () => undefined }] };
    },
    queryBrowserPermission: async () => "unknown",
  });

  assert.equal(nativeRequested, true);
  assert.equal(getUserMediaCalled, true);
  assert.equal(result.platform, "android");
  assert.equal(result.nativePermissionState, "granted");
  assert.equal(result.permissionGranted, true);
});

test("web platform uses browser getUserMedia path", async () => {
  installLocalStorage();
  let getUserMediaCalled = false;
  const result = await requestMicrophonePermissionAfterUserAction({
    isAndroidNative: async () => false,
    requestNativePermission: async () => assert.fail("web path must not request native permission"),
    getUserMediaSupported: () => true,
    getUserMedia: async () => {
      getUserMediaCalled = true;
      return { getTracks: () => [{ stop: () => undefined }] };
    },
    queryBrowserPermission: async () => "prompt",
  });

  assert.equal(getUserMediaCalled, true);
  assert.equal(result.platform, "web");
  assert.equal(result.permissionGranted, true);
});

test("denied microphone state shows useful recording copy", () => {
  const recorder = readFileSync(resolve(process.cwd(), "components/Recorder.tsx"), "utf8");

  assert.match(recorder, /Microphone access is needed to record a hum\./);
  assert.match(recorder, /Enable microphone/);
  assert.match(recorder, /Open settings/);
});

test("microphone first-open prompt only shows when permission is missing", () => {
  assert.equal(shouldShowFirstOpenMicrophonePrompt(status("prompt"), false), true);
  assert.equal(shouldShowFirstOpenMicrophonePrompt(status("denied"), false), true);
  assert.equal(shouldShowFirstOpenMicrophonePrompt(status("granted"), false), false);
  assert.equal(shouldShowFirstOpenMicrophonePrompt(status("unsupported"), false), false);
  assert.equal(shouldShowFirstOpenMicrophonePrompt(status("prompt"), true), false);
});

test("Android manifest and WebView bridge allow microphone without unnecessary permissions", () => {
  const manifest = readFileSync(resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml"), "utf8");
  const activity = readFileSync(resolve(process.cwd(), "android/app/src/main/java/com/qdenxp/hum/MainActivity.java"), "utf8");

  assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.doesNotMatch(manifest, /android\.permission\.MODIFY_AUDIO_SETTINGS/);
  assert.match(activity, /PermissionRequest\.RESOURCE_AUDIO_CAPTURE/);
  assert.match(activity, /Manifest\.permission\.RECORD_AUDIO/);
  assert.match(activity, /request\.deny\(\)/);
});

function status(state: "granted" | "prompt" | "denied" | "unsupported") {
  return {
    platform: "web" as const,
    getUserMediaSupported: state !== "unsupported",
    capacitorDetected: false,
    nativePermissionState: null,
    browserPermissionState: state === "unsupported" ? "unsupported" as const : state,
    permissionGranted: state === "granted",
    permissionDenied: state === "denied",
    permissionPrompted: state === "prompt",
    lastCheckAt: "2026-06-06T10:00:00.000Z",
    lastErrorCode: null,
    lastErrorMessage: null,
    state,
  };
}

function installLocalStorage() {
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
    value: { localStorage },
  });

  return localStorage;
}
