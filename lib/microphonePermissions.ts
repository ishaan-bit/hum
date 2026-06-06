import type { PermissionState } from "@capacitor/core";

export const HUM_MICROPHONE_STATUS_KEY = "hum:microphone-status:v1";

export type MicrophonePermissionState = "granted" | "prompt" | "denied" | "unsupported" | "unknown";

export type MicrophonePermissionDiagnostics = {
  platform: "web" | "android";
  getUserMediaSupported: boolean;
  capacitorDetected: boolean;
  nativePermissionState: PermissionState | "unsupported" | "unknown" | null;
  browserPermissionState: PermissionState | "unsupported" | "unknown" | null;
  permissionGranted: boolean;
  permissionDenied: boolean;
  permissionPrompted: boolean;
  lastCheckAt: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

export type MicrophonePermissionStatus = MicrophonePermissionDiagnostics & {
  state: MicrophonePermissionState;
};

type TrackLike = { stop: () => void };
type StreamLike = { getTracks: () => TrackLike[] };

type MicrophonePermissionDeps = {
  getUserMediaSupported?: () => boolean;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<StreamLike>;
  queryBrowserPermission?: () => Promise<PermissionState | "unsupported" | "unknown">;
  isAndroidNative?: () => Promise<boolean>;
  checkNativePermission?: () => Promise<PermissionState | "unsupported" | "unknown">;
  requestNativePermission?: () => Promise<PermissionState | "unsupported" | "unknown">;
  openAndroidSettings?: () => Promise<boolean>;
  now?: () => string;
};

export async function checkMicrophonePermission(
  deps: MicrophonePermissionDeps = {},
): Promise<MicrophonePermissionStatus> {
  const now = deps.now?.() ?? new Date().toISOString();
  const capacitorDetected = await isAndroidNativeRuntime(deps);
  const getUserMediaSupported = canUseGetUserMedia(deps);
  const nativePermissionState = capacitorDetected ? await checkNativeMicrophonePermission(deps) : null;
  const browserPermissionState = await queryBrowserMicrophonePermission(deps);

  return writeMicrophoneDiagnostics(
    toStatus({
      platform: capacitorDetected ? "android" : "web",
      getUserMediaSupported,
      capacitorDetected,
      nativePermissionState,
      browserPermissionState,
      lastCheckAt: now,
      lastErrorCode: null,
      lastErrorMessage: null,
    }),
  );
}

export async function requestMicrophonePermissionAfterUserAction(
  deps: MicrophonePermissionDeps = {},
): Promise<MicrophonePermissionStatus> {
  const now = deps.now?.() ?? new Date().toISOString();
  const capacitorDetected = await isAndroidNativeRuntime(deps);
  const getUserMediaSupported = canUseGetUserMedia(deps);
  let nativePermissionState: MicrophonePermissionDiagnostics["nativePermissionState"] = capacitorDetected
    ? await checkNativeMicrophonePermission(deps)
    : null;
  let browserPermissionState = await queryBrowserMicrophonePermission(deps);

  if (!getUserMediaSupported) {
    return writeMicrophoneDiagnostics(
      toStatus({
        platform: capacitorDetected ? "android" : "web",
        getUserMediaSupported,
        capacitorDetected,
        nativePermissionState,
        browserPermissionState: "unsupported",
        lastCheckAt: now,
        lastErrorCode: "get-user-media-unsupported",
        lastErrorMessage: "Microphone capture is not supported in this app.",
      }),
    );
  }

  try {
    if (capacitorDetected && deps.requestNativePermission && nativePermissionState !== "granted") {
      nativePermissionState = await deps.requestNativePermission();
      if (nativePermissionState === "denied") {
        return writeMicrophoneDiagnostics(
          toStatus({
            platform: "android",
            getUserMediaSupported,
            capacitorDetected,
            nativePermissionState,
            browserPermissionState,
            lastCheckAt: now,
            lastErrorCode: "native-permission-denied",
            lastErrorMessage: "Android microphone permission was denied.",
          }),
        );
      }
    }

    const stream = await requestTestMicrophoneStream(deps);
    stopStream(stream);
    browserPermissionState = "granted";
    if (capacitorDetected && nativePermissionState !== "denied") nativePermissionState = "granted";

    return writeMicrophoneDiagnostics(
      toStatus({
        platform: capacitorDetected ? "android" : "web",
        getUserMediaSupported,
        capacitorDetected,
        nativePermissionState,
        browserPermissionState,
        lastCheckAt: now,
        lastErrorCode: null,
        lastErrorMessage: null,
      }),
    );
  } catch (error) {
    const denied = isMicrophoneDeniedError(error);
    browserPermissionState = denied ? "denied" : browserPermissionState;
    if (capacitorDetected && denied && nativePermissionState !== "granted") nativePermissionState = "denied";

    return writeMicrophoneDiagnostics(
      toStatus({
        platform: capacitorDetected ? "android" : "web",
        getUserMediaSupported,
        capacitorDetected,
        nativePermissionState,
        browserPermissionState,
        lastCheckAt: now,
        lastErrorCode: denied ? "microphone-permission-denied" : "microphone-check-failed",
        lastErrorMessage: errorMessage(error),
      }),
    );
  }
}

export function shouldShowFirstOpenMicrophonePrompt(status: MicrophonePermissionStatus | null, dismissed: boolean) {
  return Boolean(status && !dismissed && status.state !== "granted" && status.state !== "unsupported");
}

export function getMicrophoneSettingsCopy(status: MicrophonePermissionStatus | null) {
  if (!status) {
    return {
      title: "Enable microphone",
      body: "Hum needs microphone access to record your hum.",
      buttonLabel: "Enable microphone",
      buttonDisabled: false,
    };
  }

  if (status.state === "granted") {
    return {
      title: "Microphone enabled",
      body: "Hum can record your short hums on this device.",
      buttonLabel: "Check again",
      buttonDisabled: false,
    };
  }

  if (status.state === "unsupported") {
    return {
      title: "Microphone unavailable",
      body: "This device does not support microphone recording in this app.",
      buttonLabel: null,
      buttonDisabled: true,
    };
  }

  if (status.state === "denied") {
    return {
      title: "Microphone blocked",
      body: "Your browser or Android settings are blocking microphone access. Enable microphone permission for Hum, then tap Check again.",
      buttonLabel: "Check again",
      buttonDisabled: false,
    };
  }

  return {
    title: "Enable microphone",
    body: "Hum needs microphone access to record your hum.",
    buttonLabel: "Enable microphone",
    buttonDisabled: false,
  };
}

export function getMicrophoneBlockedInstructions(status: Pick<MicrophonePermissionStatus, "platform" | "capacitorDetected"> | null) {
  if (status?.platform === "android" || status?.capacitorDetected) {
    return "Open Android Settings -> Apps -> Hum -> Permissions -> Microphone.";
  }

  return "Enable microphone permission for Hum in this browser, then try again.";
}

export async function openAndroidMicrophoneSettings(deps: MicrophonePermissionDeps = {}) {
  if (deps.openAndroidSettings) return deps.openAndroidSettings();
  if (!(await isAndroidNativeRuntime(deps))) return false;

  try {
    const { Capacitor } = await import("@capacitor/core");
    const capacitorWithPlugins = Capacitor as typeof Capacitor & {
      Plugins?: { App?: { openSettings?: () => Promise<void> } };
    };
    const appPlugin = capacitorWithPlugins.Plugins?.App;
    if (!appPlugin?.openSettings) return false;
    await appPlugin.openSettings();
    return true;
  } catch {
    return false;
  }
}

function toStatus(
  input: Omit<
    MicrophonePermissionDiagnostics,
    "permissionGranted" | "permissionDenied" | "permissionPrompted"
  >,
): MicrophonePermissionStatus {
  const state = getPermissionState(input);
  return {
    ...input,
    permissionGranted: state === "granted",
    permissionDenied: state === "denied",
    permissionPrompted: state === "prompt",
    state,
  };
}

function getPermissionState(
  input: Omit<
    MicrophonePermissionDiagnostics,
    "permissionGranted" | "permissionDenied" | "permissionPrompted"
  >,
): MicrophonePermissionState {
  if (!input.getUserMediaSupported || input.browserPermissionState === "unsupported") return "unsupported";
  if (input.nativePermissionState === "granted" || input.browserPermissionState === "granted") return "granted";
  if (input.nativePermissionState === "denied" || input.browserPermissionState === "denied") return "denied";
  if (input.nativePermissionState === "prompt" || input.browserPermissionState === "prompt") return "prompt";
  return "prompt";
}

function writeMicrophoneDiagnostics(status: MicrophonePermissionStatus) {
  if (typeof window !== "undefined") {
    const diagnostics: MicrophonePermissionDiagnostics = {
      platform: status.platform,
      getUserMediaSupported: status.getUserMediaSupported,
      capacitorDetected: status.capacitorDetected,
      nativePermissionState: status.nativePermissionState,
      browserPermissionState: status.browserPermissionState,
      permissionGranted: status.permissionGranted,
      permissionDenied: status.permissionDenied,
      permissionPrompted: status.permissionPrompted,
      lastCheckAt: status.lastCheckAt,
      lastErrorCode: status.lastErrorCode,
      lastErrorMessage: status.lastErrorMessage,
    };
    window.localStorage.setItem(HUM_MICROPHONE_STATUS_KEY, JSON.stringify(diagnostics));
  }
  return status;
}

function canUseGetUserMedia(deps: MicrophonePermissionDeps) {
  if (deps.getUserMediaSupported) return deps.getUserMediaSupported();
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

async function requestTestMicrophoneStream(deps: MicrophonePermissionDeps) {
  const getUserMedia = deps.getUserMedia ?? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  return getUserMedia({ audio: true });
}

function stopStream(stream: StreamLike) {
  for (const track of stream.getTracks()) track.stop();
}

async function queryBrowserMicrophonePermission(deps: MicrophonePermissionDeps) {
  if (deps.queryBrowserPermission) return deps.queryBrowserPermission();
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unknown";

  try {
    const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return result.state;
  } catch {
    return "unknown";
  }
}

async function checkNativeMicrophonePermission(deps: MicrophonePermissionDeps) {
  if (deps.checkNativePermission) return deps.checkNativePermission();
  return "unknown";
}

async function isAndroidNativeRuntime(deps: Pick<MicrophonePermissionDeps, "isAndroidNative">) {
  if (deps.isAndroidNative) return deps.isAndroidNative();
  if (typeof window === "undefined") return false;

  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.getPlatform() === "android" && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function isMicrophoneDeniedError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(error.name);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Microphone permission check failed.";
}
