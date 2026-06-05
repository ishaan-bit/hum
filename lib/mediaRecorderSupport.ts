export type MediaRecorderMimeTypeSelection = {
  mimeType: string | null;
  strategy: "explicit" | "no-explicit-type" | "unsupported";
  supportedMimeTypes: string[];
  unsupportedMimeTypes: string[];
};

type MediaRecorderSupport = {
  isTypeSupported?: (mimeType: string) => boolean;
};

export const MEDIA_RECORDER_MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/aac",
] as const;

export function selectMediaRecorderMimeType(
  recorderSupport: MediaRecorderSupport | undefined =
    typeof MediaRecorder === "undefined" ? undefined : MediaRecorder,
  candidates: readonly string[] = MEDIA_RECORDER_MIME_TYPE_CANDIDATES,
): MediaRecorderMimeTypeSelection {
  if (!recorderSupport || typeof recorderSupport.isTypeSupported !== "function") {
    return {
      mimeType: null,
      strategy: "no-explicit-type",
      supportedMimeTypes: [],
      unsupportedMimeTypes: [...candidates],
    };
  }

  const supportedMimeTypes: string[] = [];
  const unsupportedMimeTypes: string[] = [];

  for (const candidate of candidates) {
    if (recorderSupport.isTypeSupported(candidate)) {
      supportedMimeTypes.push(candidate);
    } else {
      unsupportedMimeTypes.push(candidate);
    }
  }

  return {
    mimeType: supportedMimeTypes[0] ?? null,
    strategy: supportedMimeTypes.length ? "explicit" : "no-explicit-type",
    supportedMimeTypes,
    unsupportedMimeTypes,
  };
}
