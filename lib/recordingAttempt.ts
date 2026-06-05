import { AUDIO_PIPELINE_THRESHOLDS } from "@/lib/audioThresholds";
import type { AudioFeatureDiagnostics } from "@/lib/audioFeatures";
import type { HumQualityResult } from "@/lib/quality";
import type { AudioFeatures } from "@/types/hum";

export type RecordingFailureStage =
  | "permission_denied"
  | "recorder_unsupported"
  | "recorder_start_failed"
  | "no_chunks_returned"
  | "empty_blob"
  | "blob_too_small"
  | "decode_failed"
  | "decoded_audio_empty"
  | "too_short"
  | "mostly_silence"
  | "near_zero_signal"
  | "quality_gate_rejected"
  | "storage_unavailable"
  | "quota_exceeded"
  | "save_failed"
  | "unknown";

export type RecordingAttemptStatus = "started" | "captured" | "failed" | "saved";

export type RecordingRuntimeContext = {
  userAgent: string | null;
  platform: string | null;
  browser: string | null;
  displayMode: "standalone" | "browser" | "unknown";
};

export type RecordingStateTransition = {
  state: string;
  atMs: number;
};

export type RecordingCaptureDiagnostics = {
  attemptId: string;
  startedAt: string;
  endedAt: string;
  requestedDurationSec: number;
  elapsedMs: number;
  selectedMimeType: string | null;
  mimeTypeStrategy: "explicit" | "no-explicit-type" | "constructor-fallback";
  supportedMimeTypes: string[];
  unsupportedMimeTypes: string[];
  recorderMimeType: string;
  recorderStateTransitions: RecordingStateTransition[];
  blobSize: number;
  blobMimeType: string;
  chunkCount: number;
  chunkSizes: number[];
  emptyChunkCount: number;
  maxLiveRms: number;
  meanLiveRms: number;
  peakLiveRms: number;
  maxLiveDb: number;
  meanLiveDb: number;
  maxLiveLevel: number;
  meanLiveLevel: number;
  finalSignalState: string;
  dominantLiveFeedbackBand: string;
  averageLiveLevelBand: string;
  liveNoiseEstimate: number | null;
  liveInterruptionEstimate: number | null;
  clippingDetected: boolean;
};

export type RecordingAttemptDiagnostic = {
  schemaVersion: 1;
  attemptId: string;
  createdAt: string;
  updatedAt: string;
  status: RecordingAttemptStatus;
  failureStage: RecordingFailureStage | null;
  failureReason: string | null;
  userMessage: string | null;
  nextStep: string | null;
  runtime: RecordingRuntimeContext;
  selectedMimeType: string | null;
  mimeTypeStrategy: string | null;
  supportedMimeTypes: string[];
  unsupportedMimeTypes: string[];
  recorderMimeType: string | null;
  recorderStateTransitions: RecordingStateTransition[];
  chunkCount: number | null;
  chunkSizes: number[];
  emptyChunkCount: number | null;
  blobType: string | null;
  blobSize: number | null;
  requestedDurationSec: number | null;
  elapsedMs: number | null;
  decode: {
    success: boolean | null;
    decodedDuration: number | null;
    trimmedDuration: number | null;
    sampleRate: number | null;
    channelCount: number | null;
    rawSampleCount: number | null;
    trimmedSampleCount: number | null;
    error: string | null;
  };
  metrics: Partial<{
    inputRms: number;
    meanRms: number;
    medianRms: number;
    peakAmplitude: number;
    activeFrameRatio: number;
    quietFrameRatio: number;
    silenceRatio: number;
    pitchCoverage: number | null;
    signalToNoiseProxy: number | null;
    noiseFloorRms: number;
    isSilent: boolean;
    isTooFaint: boolean;
    maxLiveRms: number;
    meanLiveRms: number;
    maxLiveLevel: number;
    meanLiveLevel: number;
  }>;
  qualityDecision: null | {
    decision: string;
    captureQuality: string;
    reason: string;
    failedGate: string | null;
    flags: string[];
    captureReasons: string[];
    stateReasons: string[];
    shouldEnterBaseline: boolean;
    shouldGenerateRecommendation: boolean;
  };
  save: {
    sessionSaved: boolean | null;
    audioSaved: boolean | null;
    quotaExceeded: boolean;
    error: string | null;
  };
};

export const MAX_RECORDING_ATTEMPT_DIAGNOSTICS = 20;
export const MIN_RECORDING_BLOB_BYTES = 512;
export const RECORDING_ATTEMPTS_STORAGE_KEY = "hum:recording-attempts:v1";

export function createRecordingAttemptId() {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `recording-attempt:${randomId}`;

  return `recording-attempt:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function getRecordingRuntimeContext(): RecordingRuntimeContext {
  if (typeof navigator === "undefined") {
    return {
      userAgent: null,
      platform: null,
      browser: null,
      displayMode: "unknown",
    };
  }

  return {
    userAgent: navigator.userAgent ?? null,
    platform: navigator.platform ?? null,
    browser: getBrowserGuess(navigator.userAgent ?? ""),
    displayMode: getDisplayMode(),
  };
}

export function createBaseRecordingAttemptDiagnostic({
  attemptId,
  createdAt,
  status,
  capture,
}: {
  attemptId: string;
  createdAt?: string;
  status: RecordingAttemptStatus;
  capture?: Partial<RecordingCaptureDiagnostics>;
}): RecordingAttemptDiagnostic {
  const timestamp = createdAt ?? new Date().toISOString();

  return {
    schemaVersion: 1,
    attemptId,
    createdAt: timestamp,
    updatedAt: timestamp,
    status,
    failureStage: null,
    failureReason: null,
    userMessage: null,
    nextStep: null,
    runtime: getRecordingRuntimeContext(),
    selectedMimeType: capture?.selectedMimeType ?? null,
    mimeTypeStrategy: capture?.mimeTypeStrategy ?? null,
    supportedMimeTypes: capture?.supportedMimeTypes ?? [],
    unsupportedMimeTypes: capture?.unsupportedMimeTypes ?? [],
    recorderMimeType: capture?.recorderMimeType ?? null,
    recorderStateTransitions: capture?.recorderStateTransitions ?? [],
    chunkCount: capture?.chunkCount ?? null,
    chunkSizes: capture?.chunkSizes ?? [],
    emptyChunkCount: capture?.emptyChunkCount ?? null,
    blobType: capture?.blobMimeType ?? null,
    blobSize: capture?.blobSize ?? null,
    requestedDurationSec: capture?.requestedDurationSec ?? null,
    elapsedMs: capture?.elapsedMs ?? null,
    decode: {
      success: null,
      decodedDuration: null,
      trimmedDuration: null,
      sampleRate: null,
      channelCount: null,
      rawSampleCount: null,
      trimmedSampleCount: null,
      error: null,
    },
    metrics: getCaptureMetricSnapshot(capture),
    qualityDecision: null,
    save: {
      sessionSaved: null,
      audioSaved: null,
      quotaExceeded: false,
      error: null,
    },
  };
}

export function withRecordingFailure(
  diagnostic: RecordingAttemptDiagnostic,
  stage: RecordingFailureStage,
  reason: string,
  error?: unknown,
): RecordingAttemptDiagnostic {
  const copy = getRecordingFailureCopy(stage);

  return {
    ...diagnostic,
    updatedAt: new Date().toISOString(),
    status: "failed",
    failureStage: stage,
    failureReason: reason,
    userMessage: copy.title,
    nextStep: copy.message,
    decode:
      stage === "decode_failed"
        ? { ...diagnostic.decode, success: false, error: summarizeError(error) }
        : diagnostic.decode,
    save:
      stage === "storage_unavailable" || stage === "quota_exceeded" || stage === "save_failed"
        ? {
            ...diagnostic.save,
            sessionSaved: false,
            quotaExceeded: stage === "quota_exceeded",
            error: summarizeError(error) ?? reason,
          }
        : diagnostic.save,
  };
}

export function withDecodedAudio(
  diagnostic: RecordingAttemptDiagnostic,
  featureDiagnostics: AudioFeatureDiagnostics | null,
  features: AudioFeatures,
): RecordingAttemptDiagnostic {
  return {
    ...diagnostic,
    updatedAt: new Date().toISOString(),
    decode: {
      success: true,
      decodedDuration: featureDiagnostics?.decodedDuration ?? null,
      trimmedDuration: featureDiagnostics?.trimmedDuration ?? features.duration,
      sampleRate: featureDiagnostics?.sampleRate ?? null,
      channelCount: featureDiagnostics?.channelCount ?? null,
      rawSampleCount: featureDiagnostics?.rawSampleCount ?? null,
      trimmedSampleCount: featureDiagnostics?.trimmedSampleCount ?? null,
      error: null,
    },
    metrics: {
      ...diagnostic.metrics,
      inputRms: features.inputRms,
      meanRms: features.meanRms,
      medianRms: features.medianRms,
      peakAmplitude: features.peakAmplitude,
      activeFrameRatio: features.activeFrameRatio,
      quietFrameRatio: features.quietFrameRatio,
      silenceRatio: features.silenceRatio,
      pitchCoverage: features.pitchCoverage,
      signalToNoiseProxy: features.signalToNoiseProxy,
      noiseFloorRms: features.noiseFloorRms,
      isSilent: features.isSilent,
      isTooFaint: features.isTooFaint,
    },
  };
}

export function withQualityDecision(
  diagnostic: RecordingAttemptDiagnostic,
  quality: HumQualityResult,
): RecordingAttemptDiagnostic {
  return {
    ...diagnostic,
    updatedAt: new Date().toISOString(),
    qualityDecision: {
      decision: quality.quality,
      captureQuality: quality.captureQuality,
      reason: quality.reason,
      failedGate: quality.failedGate,
      flags: quality.flags,
      captureReasons: quality.captureReasons,
      stateReasons: quality.stateReasons,
      shouldEnterBaseline: quality.shouldEnterBaseline,
      shouldGenerateRecommendation: quality.shouldGenerateRecommendation,
    },
  };
}

export function withSaveResult(
  diagnostic: RecordingAttemptDiagnostic,
  result: { sessionSaved: boolean; audioSaved: boolean | null; error?: unknown },
): RecordingAttemptDiagnostic {
  const failureStage = result.sessionSaved ? null : classifyStorageError(result.error);
  const copy = failureStage ? getRecordingFailureCopy(failureStage) : null;

  return {
    ...diagnostic,
    updatedAt: new Date().toISOString(),
    status: result.sessionSaved ? "saved" : "failed",
    failureStage,
    failureReason: result.sessionSaved ? null : (summarizeError(result.error) ?? "save failed"),
    userMessage: copy?.title ?? diagnostic.userMessage,
    nextStep: copy?.message ?? diagnostic.nextStep,
    save: {
      sessionSaved: result.sessionSaved,
      audioSaved: result.audioSaved,
      quotaExceeded: isQuotaExceededError(result.error),
      error: result.error ? summarizeError(result.error) : null,
    },
  };
}

export function classifyCaptureBlob(
  blob: Blob,
  diagnostics: Pick<RecordingCaptureDiagnostics, "chunkCount" | "chunkSizes" | "blobSize">,
): { stage: RecordingFailureStage; reason: string } | null {
  if (diagnostics.chunkCount === 0) {
    return { stage: "no_chunks_returned", reason: "recorder returned no audio chunks" };
  }

  if (diagnostics.chunkSizes.every((size) => size === 0)) {
    return { stage: "empty_blob", reason: "recorder returned only empty chunks" };
  }

  if (blob.size === 0 || diagnostics.blobSize === 0) {
    return { stage: "empty_blob", reason: "recording blob was empty" };
  }

  if (blob.size < MIN_RECORDING_BLOB_BYTES) {
    return { stage: "blob_too_small", reason: `recording blob was smaller than ${MIN_RECORDING_BLOB_BYTES} bytes` };
  }

  return null;
}

export function classifyDecodedAudio(
  diagnostics: AudioFeatureDiagnostics | null,
): { stage: RecordingFailureStage; reason: string } | null {
  if (!diagnostics) return null;

  if (
    diagnostics.decodedDuration <= 0 ||
    diagnostics.rawSampleCount === 0 ||
    diagnostics.trimmedSampleCount === 0
  ) {
    return { stage: "decoded_audio_empty", reason: "decoded audio had no usable samples" };
  }

  if (diagnostics.decodedDuration < 0.25) {
    return { stage: "decoded_audio_empty", reason: "decoded audio duration was near zero" };
  }

  return null;
}

export function classifyQualityRejection(
  quality: HumQualityResult,
  features: AudioFeatures,
): { stage: RecordingFailureStage; reason: string } {
  if (quality.reason === "too short" || features.duration < AUDIO_PIPELINE_THRESHOLDS.qualityGate.minimumDurationSec) {
    return { stage: "too_short", reason: quality.failedGate ?? quality.reason };
  }

  if (
    features.isSilent ||
    features.meanRms <= AUDIO_PIPELINE_THRESHOLDS.qualityGate.nearSilenceMeanRms ||
    quality.flags.includes("near-silent") ||
    quality.flags.includes("very-low-rms")
  ) {
    return { stage: "near_zero_signal", reason: quality.failedGate ?? quality.reason };
  }

  if (
    quality.reason === "too interrupted" ||
    features.silenceRatio > AUDIO_PIPELINE_THRESHOLDS.qualityGate.maximumSilenceRatio ||
    quality.flags.includes("excessive-silence")
  ) {
    return { stage: "mostly_silence", reason: quality.failedGate ?? quality.reason };
  }

  return { stage: "quality_gate_rejected", reason: quality.failedGate ?? quality.reason };
}

export function getRecordingFailureCopy(stage: RecordingFailureStage) {
  if (stage === "permission_denied") {
    return {
      title: "Mic access is blocked.",
      message: "Allow microphone access and try again.",
    };
  }

  if (stage === "recorder_unsupported") {
    return {
      title: "Recording is not supported in this browser.",
      message: "Try Safari, Chrome, or the installed app on this device.",
    };
  }

  if (stage === "recorder_start_failed") {
    return {
      title: "The mic did not start cleanly.",
      message: "Refresh once and try again.",
    };
  }

  if (stage === "no_chunks_returned" || stage === "empty_blob" || stage === "blob_too_small") {
    return {
      title: "Your phone did not return audio for that attempt.",
      message: "Refresh once and try again.",
    };
  }

  if (stage === "decode_failed") {
    return {
      title: "The recording was captured, but this browser could not read it back.",
      message: "Refresh once and try again.",
    };
  }

  if (stage === "decoded_audio_empty") {
    return {
      title: "The recording decoded as empty.",
      message: "Refresh once and try one steady hum.",
    };
  }

  if (stage === "too_short") {
    return {
      title: "That one was too short to compare safely.",
      message: "Try one full 12-second hum.",
    };
  }

  if (stage === "near_zero_signal") {
    return {
      title: "I barely got signal from the mic.",
      message: "Hold the phone a little closer and hum steadily.",
    };
  }

  if (stage === "mostly_silence") {
    return {
      title: "That one had too much silence.",
      message: "Try one steady hum.",
    };
  }

  if (stage === "storage_unavailable" || stage === "quota_exceeded" || stage === "save_failed") {
    return {
      title: "The hum was captured, but saving failed on this device.",
      message: "Free a little browser storage or try again after a refresh.",
    };
  }

  if (stage === "quality_gate_rejected") {
    return {
      title: "I heard the attempt, but it was not steady enough to compare safely.",
      message: "Try one steady hum.",
    };
  }

  return {
    title: "Something interrupted that recording.",
    message: "Try once more after a refresh.",
  };
}

export function saveRecordingAttemptDiagnostic(diagnostic: RecordingAttemptDiagnostic) {
  if (typeof window === "undefined") return false;

  try {
    const current = getRecordingAttemptDiagnostics();
    const next = [
      diagnostic,
      ...current.filter((entry) => entry.attemptId !== diagnostic.attemptId),
    ].slice(0, MAX_RECORDING_ATTEMPT_DIAGNOSTICS);
    window.localStorage.setItem(RECORDING_ATTEMPTS_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function getRecordingAttemptDiagnostics(): RecordingAttemptDiagnostic[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(RECORDING_ATTEMPTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isRecordingAttemptDiagnostic) : [];
  } catch {
    return [];
  }
}

export function classifyStorageError(error: unknown): RecordingFailureStage {
  if (isQuotaExceededError(error)) return "quota_exceeded";
  if (typeof window !== "undefined" && !window.localStorage) return "storage_unavailable";
  return "save_failed";
}

export function isPermissionDeniedError(error: unknown) {
  const name = getErrorName(error);
  return name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError";
}

export function summarizeError(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "object" && "name" in error) {
    const name = String((error as { name?: unknown }).name ?? "Error");
    const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
    return message ? `${name}: ${message}` : name;
  }

  return String(error);
}

function isQuotaExceededError(error: unknown) {
  const name = getErrorName(error);
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

function getErrorName(error: unknown) {
  if (!error || typeof error !== "object" || !("name" in error)) return null;
  return String((error as { name?: unknown }).name ?? "");
}

function getBrowserGuess(userAgent: string) {
  if (!userAgent) return null;
  if (/CriOS/i.test(userAgent)) return "Chrome iOS";
  if (/FxiOS/i.test(userAgent)) return "Firefox iOS";
  if (/EdgiOS/i.test(userAgent)) return "Edge iOS";
  if (/Chrome\//i.test(userAgent)) return "Chrome";
  if (/Safari\//i.test(userAgent) && /Version\//i.test(userAgent)) return "Safari";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Edg\//i.test(userAgent)) return "Edge";
  return "Unknown";
}

function getDisplayMode(): RecordingRuntimeContext["displayMode"] {
  if (typeof window === "undefined") return "unknown";
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  if (standaloneNavigator.standalone === true) return "standalone";
  if (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) {
    return "standalone";
  }

  return "browser";
}

function getCaptureMetricSnapshot(capture?: Partial<RecordingCaptureDiagnostics>): RecordingAttemptDiagnostic["metrics"] {
  if (!capture) return {};

  return {
    maxLiveRms: capture.maxLiveRms,
    meanLiveRms: capture.meanLiveRms,
    maxLiveLevel: capture.maxLiveLevel,
    meanLiveLevel: capture.meanLiveLevel,
  };
}

function isRecordingAttemptDiagnostic(value: unknown): value is RecordingAttemptDiagnostic {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RecordingAttemptDiagnostic>;
  return record.schemaVersion === 1 && typeof record.attemptId === "string";
}
