import { buildMomentRead } from "@/lib/momentRead";
import { getBaseline, getBaselineProgress } from "@/lib/recommendation";
import type { FeedbackValue, HumSession, RegulationFeedbackValue, TasteFeedbackValue } from "@/types/hum";

export const HUM_APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";
export const HUM_FIREBASE_MODEL_VERSION = "rule-based-hum-v2";

export const forbiddenFirestoreHumFields = [
  "audio",
  "audioBlob",
  "audioBuffer",
  "audioData",
  "audioBase64",
  "rawAudio",
  "recording",
  "recordingUrl",
  "file",
  "fileUrl",
  "blob",
  "waveformRaw",
  "microphoneData",
] as const;

export type FirestoreHumPayload = {
  humId: string;
  createdAt: string;
  syncedAt: string;
  appVersion: string;
  platform: "web";
  model: string;
  qualityDecision: string | null;
  captureQuality: string | null;
  signalCleanliness: string | null;
  signalConfidence: number | null;
  baselineProgress: number;
  duration: number | null;
  clarity: number | null;
  snrProxy: number | null;
  breathinessProxy: number | null;
  voicedPercentage: number | null;
  activeFrameRatio: number | null;
  silencePercentage: number | null;
  quietFrameRatio: number | null;
  inputStrength: number | null;
  meanLoudnessRms: number | null;
  rmsEnergy: number | null;
  peakAmplitude: number | null;
  volumeSteadiness: number | null;
  volumeShimmer: number | null;
  pitchCenterHz: number | null;
  pitchRangeSt: number | null;
  pitchVariance: number | null;
  pitchSteadinessScore: number | null;
  microWobbleJitter: number | null;
  pitchDrift: number | null;
  smoothness: number | null;
  longestStableSegment: number | null;
  attackConsistency: number | null;
  musicalityScore: number | null;
  controlledExpressionScore: number | null;
  residualInstabilityScore: number | null;
  residualPitchInstability: number | null;
  residualVolumeInstability: number | null;
  voicingContinuityCoverage: number | null;
  pitchStableSegmentCoverage: number | null;
  phraseLevelContinuity: number | null;
  breaks: number | null;
  pauseCount: number | null;
  avgPauseLength: number | null;
  microBreakRatio: number | null;
  brightness: number | null;
  spectralMovement: number | null;
  spectralBandwidth: number | null;
  spectralRolloff: number | null;
  spectralFlatness: number | null;
  readId: string | null;
  readFamily: string | null;
  readLabel: string | null;
  threadId: string | null;
  threadFamily: string | null;
  songIntent: string | null;
  readFeedback: FeedbackValue | null;
  threadFeedback: string | null;
  songFeedback: RegulationFeedbackValue | TasteFeedbackValue[] | null;
};

type BuildFirestoreHumPayloadOptions = {
  sessions?: HumSession[];
  syncedAt?: string;
};

type SessionWithDerivedFields = HumSession & {
  readId?: string;
  readFamily?: string;
  readLabel?: string;
  momentRead?: { readId?: string; family?: string; label?: string; songIntent?: string };
  read?: { readId?: string; family?: string; label?: string; songIntent?: string };
  threadId?: string;
  threadFamily?: string;
  threadFeedback?: string;
  readFeedback?: FeedbackValue | null;
  songFeedback?: RegulationFeedbackValue | TasteFeedbackValue[] | null;
};

export function buildFirestoreHumPayload(
  session: HumSession,
  options: BuildFirestoreHumPayloadOptions = {},
): FirestoreHumPayload {
  const sessions = options.sessions ?? [session];
  const baseline = getBaseline(sessions);
  const baselineProgress = getBaselineProgress(sessions);
  const read = buildMomentRead({
    features: session.features,
    baseline,
    baselineProgress,
    quality: session.quality,
    captureQuality: session.captureQuality,
    captureReasons: session.captureReasons,
    stateReasons: session.stateReasons,
    shouldRecommend: session.shouldGenerateRecommendation,
    confidenceWeight: session.confidenceWeight,
    signalConfidence: session.mlData?.signalConfidence,
    validBaselineCount: session.validBaselineCount,
    baselineComparison: session.baselineComparison,
    dimensionScores: session.dimensionScores,
    labelConfidence: session.labelConfidence,
  });
  const source = session as SessionWithDerivedFields;
  const features = session.features;
  const musicFeedback = session.musicSession?.feedback;

  const payload: FirestoreHumPayload = {
    humId: session.sessionId || session.id,
    createdAt: session.createdAt,
    syncedAt: options.syncedAt ?? new Date().toISOString(),
    appVersion: HUM_APP_VERSION,
    platform: "web",
    model: HUM_FIREBASE_MODEL_VERSION,
    qualityDecision: session.qualityDecision?.decision ?? session.quality ?? null,
    captureQuality: session.captureQuality ?? session.qualityDecision?.captureQuality ?? null,
    signalCleanliness: session.quality ?? session.captureQuality ?? null,
    signalConfidence: numberOrNull(session.mlData?.signalConfidence ?? session.confidenceWeight ?? session.labelConfidence),
    baselineProgress: session.validBaselineCount ?? baselineProgress,
    duration: numberOrNull(features.duration),
    clarity: numberOrNull(features.clarityScore),
    snrProxy: numberOrNull(features.signalToNoiseProxy),
    breathinessProxy: numberOrNull(features.breathinessProxy),
    voicedPercentage: numberOrNull(features.pitchCoverage),
    activeFrameRatio: numberOrNull(features.activeFrameRatio),
    silencePercentage: numberOrNull(features.silenceRatio),
    quietFrameRatio: numberOrNull(features.quietFrameRatio),
    inputStrength: numberOrNull(features.inputRms),
    meanLoudnessRms: numberOrNull(features.meanRms),
    rmsEnergy: numberOrNull(features.rmsEnergy),
    peakAmplitude: numberOrNull(features.peakAmplitude),
    volumeSteadiness: numberOrNull(features.amplitudeStability),
    volumeShimmer: numberOrNull(features.shimmerProxy),
    pitchCenterHz: numberOrNull(features.pitchMean ?? features.pitchHz),
    pitchRangeSt: numberOrNull(features.pitchRange),
    pitchVariance: numberOrNull(features.pitchVariance),
    pitchSteadinessScore: numberOrNull(features.pitchStability),
    microWobbleJitter: numberOrNull(features.jitter),
    pitchDrift: numberOrNull(features.pitchDrift),
    smoothness: numberOrNull(features.smoothnessScore),
    longestStableSegment: numberOrNull(features.longestStableSegment),
    attackConsistency: numberOrNull(features.attackConsistency),
    musicalityScore: numberOrNull(features.musicalityScore),
    controlledExpressionScore: numberOrNull(features.controlledExpressionScore),
    residualInstabilityScore: numberOrNull(features.residualInstabilityScore),
    residualPitchInstability: numberOrNull(features.residualPitchInstability),
    residualVolumeInstability: numberOrNull(features.residualAmplitudeInstability),
    voicingContinuityCoverage: numberOrNull(features.voicingContinuityCoverage),
    pitchStableSegmentCoverage: numberOrNull(features.pitchStableSegmentCoverage ?? features.stableSegmentCoverage),
    phraseLevelContinuity: numberOrNull(features.phraseContinuityCoverage),
    breaks: numberOrNull(features.breakCount),
    pauseCount: numberOrNull(features.pauseCount),
    avgPauseLength: numberOrNull(features.avgPauseLength),
    microBreakRatio: numberOrNull(features.microBreakRatio),
    brightness: numberOrNull(features.spectralCentroid),
    spectralMovement: numberOrNull(features.spectralFlux),
    spectralBandwidth: numberOrNull(features.spectralBandwidth),
    spectralRolloff: numberOrNull(features.spectralRolloff),
    spectralFlatness: numberOrNull(features.spectralFlatness),
    readId: stringOrNull(source.readId ?? source.momentRead?.readId ?? source.read?.readId ?? read.readId),
    readFamily: stringOrNull(source.readFamily ?? source.momentRead?.family ?? source.read?.family ?? read.family),
    readLabel: stringOrNull(source.readLabel ?? source.momentRead?.label ?? source.read?.label ?? read.label),
    threadId: stringOrNull(source.threadId),
    threadFamily: stringOrNull(source.threadFamily),
    songIntent: stringOrNull(source.momentRead?.songIntent ?? source.read?.songIntent ?? read.songIntent),
    readFeedback: source.readFeedback ?? session.feedback ?? null,
    threadFeedback: source.threadFeedback ?? null,
    songFeedback: source.songFeedback ?? musicFeedback?.tasteOutcome ?? musicFeedback?.regulationOutcome ?? null,
  };

  assertNoForbiddenFirestoreHumFields(payload);
  return payload;
}

export function assertNoForbiddenFirestoreHumFields(payload: Record<string, unknown>) {
  for (const field of forbiddenFirestoreHumFields) {
    if (field in payload) {
      throw new Error(`Forbidden Firestore hum field: ${field}`);
    }
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
