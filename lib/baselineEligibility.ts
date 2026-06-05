import { AUDIO_PIPELINE_THRESHOLDS } from "@/lib/audioThresholds";
import type { AudioFeatures, HumQuality, HumSession } from "@/types/hum";

export type BaselineEligibility = {
  eligible: boolean;
  reason: string;
};

const lowQualityFlags = new Set([
  "too-short",
  "near-silent",
  "very-low-rms",
  "clipping",
  "excessive-silence",
  "poor-pitch-coverage",
  "high-noise-floor",
  "low-active-audio",
  "low-rms",
  "too-faint",
  "low-quality",
]);

export function getBaselineEligibility(session: Partial<HumSession>): BaselineEligibility {
  const features = session.features;
  if (!hasUsableFeatureData(features)) return { eligible: false, reason: "missing or broken features" };

  const qualityDecision = session.qualityDecision;
  const storedQuality = (session as { quality?: HumQuality }).quality;
  const captureQuality = session.captureQuality ?? qualityDecision?.captureQuality;
  if (captureQuality === "poor" || captureQuality === "rejected") {
    return { eligible: false, reason: `capture quality ${captureQuality}` };
  }
  if (qualityDecision?.decision === "rejected") return { eligible: false, reason: "quality decision rejected" };
  if (storedQuality === "rejected") return { eligible: false, reason: "quality rejected" };
  if (session.rejectionReason) return { eligible: false, reason: `rejected: ${session.rejectionReason}` };
  if (qualityDecision?.flags?.some((flag) => lowQualityFlags.has(flag))) {
    return { eligible: false, reason: `low-quality flag: ${qualityDecision.flags.find((flag) => lowQualityFlags.has(flag))}` };
  }

  if (features.duration < AUDIO_PIPELINE_THRESHOLDS.qualityGate.minimumDurationSec) {
    return { eligible: false, reason: `duration < ${AUDIO_PIPELINE_THRESHOLDS.qualityGate.minimumDurationSec}` };
  }
  if (features.isSilent) return { eligible: false, reason: "silent" };
  if (features.isTooFaint && captureQuality !== "soft_usable") return { eligible: false, reason: "too faint" };
  if (features.meanRms <= AUDIO_PIPELINE_THRESHOLDS.qualityGate.nearSilenceMeanRms) {
    return { eligible: false, reason: `meanRms <= ${AUDIO_PIPELINE_THRESHOLDS.qualityGate.nearSilenceMeanRms}` };
  }
  if (features.clippedFrameRatio > AUDIO_PIPELINE_THRESHOLDS.maximumClippedFrameRatio) {
    return { eligible: false, reason: `clippedFrameRatio > ${AUDIO_PIPELINE_THRESHOLDS.maximumClippedFrameRatio}` };
  }
  if (
    features.silenceRatio > AUDIO_PIPELINE_THRESHOLDS.qualityGate.maximumSilenceRatio ||
    (features.quietFrameRatio > AUDIO_PIPELINE_THRESHOLDS.maximumQuietFrameRatio &&
      !isQuietContinuousUsable(features, captureQuality))
  ) {
    return { eligible: false, reason: "too much silence or quiet audio" };
  }
  if (
    features.activeFrameRatio < AUDIO_PIPELINE_THRESHOLDS.qualityGate.minimumActiveFrameRatio &&
    getDecisionRms(features) < AUDIO_PIPELINE_THRESHOLDS.qualityGate.softRms
  ) {
    return { eligible: false, reason: "too little usable audio" };
  }
  if (
    features.pitchCoverage !== null &&
    features.pitchCoverage < AUDIO_PIPELINE_THRESHOLDS.qualityGate.minimumPitchCoverage
  ) {
    return { eligible: false, reason: `pitchCoverage < ${AUDIO_PIPELINE_THRESHOLDS.qualityGate.minimumPitchCoverage}` };
  }
  if (
    features.noiseFloorRms > AUDIO_PIPELINE_THRESHOLDS.maximumNoiseFloorRms &&
    ((features.clarityScore !== null && features.clarityScore < 0.35) ||
      (features.pitchCoverage !== null && features.pitchCoverage < 0.45))
  ) {
    return { eligible: false, reason: "too noisy" };
  }
  if ((session.confidenceWeight ?? 1) <= 0) return { eligible: false, reason: "zero confidence" };

  return { eligible: true, reason: "eligible" };
}

export function isBaselineEligibleSession(session: Partial<HumSession>) {
  return getBaselineEligibility(session).eligible;
}

function hasUsableFeatureData(features: AudioFeatures | undefined): features is AudioFeatures {
  if (!features || typeof features !== "object") return false;
  const numericSignals = [
    features.duration,
    features.inputRms,
    features.meanRms,
    features.medianRms,
    features.activeFrameRatio,
    features.silenceRatio,
  ];

  return numericSignals.some((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
}

function getDecisionRms(features: AudioFeatures) {
  return features.medianRms || features.meanRms || features.inputRms || 0;
}

function isQuietContinuousUsable(features: AudioFeatures, captureQuality: HumSession["captureQuality"] | undefined) {
  return (
    captureQuality === "soft_usable" &&
    features.meanRms > AUDIO_PIPELINE_THRESHOLDS.qualityGate.nearSilenceMeanRms &&
    features.peakAmplitude >= AUDIO_PIPELINE_THRESHOLDS.basicallySilentPeak &&
    features.activeFrameRatio >= 0.55 &&
    features.silenceRatio <= 0.45 &&
    (features.pitchCoverage === null || features.pitchCoverage >= 0.5) &&
    (features.signalToNoiseProxy === null || features.signalToNoiseProxy >= 2.5)
  );
}
