import type {
  AudioFeatures,
  BaselineComparison,
  DimensionScores,
  FeedbackValue,
  HumContours,
  HumFeatureVector,
  HumMLData,
  HumSession,
  HumSessionMetadata,
  HumTaskType,
  QualityDecisionLog,
  SignalLabel,
} from "@/types/hum";
import { humFeatureVectorKeys } from "@/lib/humFeatureInventory";

const emptyContours: HumContours = {
  schemaVersion: 1,
  pitchHz: [],
  rmsEnergy: [],
  voiced: [],
  spectralCentroid: [],
  spectralFlux: [],
};

export function buildFeatureVector(features: AudioFeatures): HumFeatureVector {
  return {
    schemaVersion: 1,
    keys: [...humFeatureVectorKeys],
    values: humFeatureVectorKeys.map((key) => {
      const value = features[key];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }),
  };
}

export function buildHumMLData({
  features,
  contours,
  qualityDecision,
  confidenceWeight,
  baselineComparison,
  dimensionScores,
  finalLabel,
}: {
  features: AudioFeatures;
  contours?: HumContours | null;
  qualityDecision?: QualityDecisionLog | null;
  confidenceWeight?: number | null;
  baselineComparison?: BaselineComparison | null;
  dimensionScores?: DimensionScores | null;
  labelConfidence?: number | null;
  finalLabel?: SignalLabel | null;
}): HumMLData {
  return {
    schemaVersion: 1,
    summaryFeatureVector: buildFeatureVector(features),
    contours: contours ?? emptyContours,
    qualityFlags: qualityDecision?.flags ?? getLegacyQualityFlags(features),
    signalConfidence: confidenceWeight ?? null,
    baselineVersion: 2,
    zScores: baselineComparison?.zScores ?? {},
    dimensionScores: dimensionScores ?? null,
    finalLabel: finalLabel ?? null,
  };
}

export function getDefaultSessionMetadata(overrides: Partial<HumSessionMetadata> = {}): HumSessionMetadata {
  const nav = typeof navigator === "undefined" ? null : navigator;
  const navWithDeviceMemory = nav as (Navigator & { deviceMemory?: number }) | null;
  const deviceMemory = navWithDeviceMemory?.deviceMemory ?? null;

  return {
    deviceMemoryGb: Number.isFinite(deviceMemory) ? deviceMemory : null,
    hardwareConcurrency: nav?.hardwareConcurrency ?? null,
    userAgent: nav?.userAgent ?? null,
    platform: nav?.platform ?? null,
    language: nav?.language ?? null,
    browser: nav?.userAgent ? inferBrowser(nav.userAgent) : null,
    sampleRate: null,
    audioMimeType: null,
    ...overrides,
  };
}

export function normalizeConsentFields(session: Partial<HumSession>) {
  return {
    researchConsent: session.researchConsent ?? false,
    audioRetainedForResearch: session.audioRetainedForResearch ?? false,
    featureExportAllowed: session.featureExportAllowed ?? false,
  };
}

export function normalizeFeedbackFields(session: Partial<HumSession>, feedback: FeedbackValue | null) {
  return {
    feedback,
    userFeedback: session.userFeedback ?? feedback,
    actionFeedback: session.actionFeedback ?? feedback,
  };
}

export function normalizeTaskType(taskType: HumTaskType | undefined): HumTaskType {
  return taskType ?? "daily_hum";
}

function getLegacyQualityFlags(features: AudioFeatures) {
  return [
    features.isSilent ? "silent" : null,
    features.isTooFaint ? "too-faint" : null,
    features.clippedFrameRatio > 0 ? "possible-clipping" : null,
  ].filter((flag): flag is string => flag !== null);
}

function inferBrowser(userAgent: string) {
  if (userAgent.includes("Edg/")) return "Edge";
  if (userAgent.includes("Chrome/")) return "Chrome";
  if (userAgent.includes("Firefox/")) return "Firefox";
  if (userAgent.includes("Safari/")) return "Safari";
  return "Unknown";
}
