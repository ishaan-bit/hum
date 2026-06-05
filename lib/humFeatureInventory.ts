import type { AudioFeatures, HumSession } from "@/types/hum";

export const humFeatureVectorKeys = [
  "duration",
  "inputRms",
  "meanRms",
  "medianRms",
  "rmsEnergy",
  "peakAmplitude",
  "activeFrameRatio",
  "quietFrameRatio",
  "clippedFrameRatio",
  "noiseFloorRms",
  "silenceRatio",
  "zeroCrossingRate",
  "spectralCentroid",
  "spectralBandwidth",
  "spectralRolloff",
  "spectralFlux",
  "spectralFlatness",
  "pitchMean",
  "pitchVariance",
  "pitchStability",
  "jitter",
  "shimmerProxy",
  "hnrProxy",
  "signalToNoiseProxy",
  "clarityScore",
  "vibratoScore",
  "vibratoRate",
  "vibratoDepth",
  "vibratoRegularity",
  "tremorProxy",
  "glideScore",
  "amplitudeStability",
  "breakCount",
  "avgPauseLength",
  "pauseCount",
  "microBreakRatio",
  "pauseStructureScore",
  "smoothnessScore",
  "pitchDrift",
  "pitchRange",
  "noteChangeRate",
  "melodicSmoothness",
  "rhythmicStability",
  "sustainStability",
  "breathBreakCount",
  "attackConsistency",
  "pitchContourShape",
  "pitchCoverage",
  "onsetDelay",
  "longestStableSegment",
  "breathinessProxy",
  "musicalityScore",
  "controlledExpressionScore",
  "residualPitchInstability",
  "residualAmplitudeInstability",
  "residualInstabilityScore",
  "stableSegmentCoverage",
  "voicingContinuityCoverage",
  "pitchStableSegmentCoverage",
  "phraseContinuityCoverage",
  "notePlateauScore",
  "stepwiseMelodicScore",
  "repeatedPitchRegionScore",
  "phraseContourScore",
] as const satisfies ReadonlyArray<keyof AudioFeatures>;

export const featureInventoryKeys = [
  ...humFeatureVectorKeys,
  "pitchHz",
  "loudness",
] as const satisfies ReadonlyArray<keyof AudioFeatures>;

export type HumFeatureInventoryKey = (typeof featureInventoryKeys)[number];

const featureLabels: Partial<Record<keyof AudioFeatures, string>> = {
  duration: "Duration",
  inputRms: "Input strength",
  meanRms: "Mean loudness",
  medianRms: "Median loudness",
  rmsEnergy: "RMS energy",
  peakAmplitude: "Peak amplitude",
  activeFrameRatio: "Active frame ratio",
  quietFrameRatio: "Quiet frame ratio",
  clippedFrameRatio: "Clipped frame ratio",
  noiseFloorRms: "Noise floor",
  silenceRatio: "Silence percentage",
  zeroCrossingRate: "Zero crossing rate",
  spectralCentroid: "Brightness",
  spectralBandwidth: "Spectral bandwidth",
  spectralRolloff: "Spectral rolloff",
  spectralFlux: "Spectral movement",
  spectralFlatness: "Spectral flatness",
  pitchMean: "Pitch center",
  pitchHz: "Pitch",
  pitchVariance: "Pitch variance",
  pitchStability: "Pitch steadiness",
  jitter: "Micro-wobble",
  shimmerProxy: "Volume shimmer",
  hnrProxy: "HNR proxy",
  signalToNoiseProxy: "Signal-to-noise proxy",
  clarityScore: "Clarity",
  vibratoScore: "Vibrato score",
  vibratoRate: "Vibrato rate",
  vibratoDepth: "Vibrato depth",
  vibratoRegularity: "Vibrato regularity",
  tremorProxy: "Tremor proxy",
  glideScore: "Glide score",
  amplitudeStability: "Volume steadiness",
  breakCount: "Breaks",
  avgPauseLength: "Average pause length",
  pauseCount: "Pause count",
  microBreakRatio: "Micro-break ratio",
  pauseStructureScore: "Pause structure",
  smoothnessScore: "Smoothness",
  pitchDrift: "Pitch drift",
  pitchRange: "Pitch range",
  noteChangeRate: "Note change rate",
  melodicSmoothness: "Melodic smoothness",
  rhythmicStability: "Rhythmic stability",
  sustainStability: "Sustain stability",
  breathBreakCount: "Breath breaks",
  attackConsistency: "Attack consistency",
  pitchContourShape: "Pitch contour shape",
  pitchCoverage: "Voiced percentage",
  onsetDelay: "Onset delay",
  longestStableSegment: "Longest stable segment",
  breathinessProxy: "Breathiness proxy",
  musicalityScore: "Musicality score",
  controlledExpressionScore: "Controlled expression score",
  residualPitchInstability: "Residual pitch instability",
  residualAmplitudeInstability: "Residual volume instability",
  residualInstabilityScore: "Residual instability score",
  stableSegmentCoverage: "Stable segment coverage",
  voicingContinuityCoverage: "Voicing continuity coverage",
  pitchStableSegmentCoverage: "Pitch-stable segment coverage",
  phraseContinuityCoverage: "Phrase-level continuity",
  notePlateauScore: "Note plateau score",
  stepwiseMelodicScore: "Stepwise melodic score",
  repeatedPitchRegionScore: "Repeated pitch region score",
  phraseContourScore: "Phrase contour score",
  loudness: "Loudness",
};

const featureKeySet = new Set<keyof AudioFeatures>(featureInventoryKeys);

export function getFeatureLabel(key: keyof AudioFeatures) {
  return featureLabels[key] ?? humanizeFeatureKey(key);
}

export function getNumericFeatureKeys(session: HumSession | null | undefined): Array<keyof AudioFeatures> {
  if (!session?.features) return [];

  const candidates = new Set<keyof AudioFeatures>();
  for (const key of session.storedFeatureKeys ?? []) candidates.add(key);
  for (const key of session.mlData?.summaryFeatureVector.keys ?? []) candidates.add(key);
  for (const key of Object.keys(session.features) as Array<keyof AudioFeatures>) candidates.add(key);

  const keys = featureInventoryKeys.filter((key) => candidates.has(key) && hasNumericFeatureValue(session.features, key));
  if (keys.includes("pitchMean") && keys.includes("pitchHz")) {
    return keys.filter((key) => key !== "pitchHz");
  }

  return keys;
}

export function hasNumericFeatureValue(features: AudioFeatures, key: keyof AudioFeatures) {
  if (!featureKeySet.has(key)) return false;
  const value = features[key];
  return typeof value === "number" && Number.isFinite(value);
}

export function getNumericFeatureValue(features: AudioFeatures, key: keyof AudioFeatures): number | null {
  if (!hasNumericFeatureValue(features, key)) return null;
  return features[key] as number;
}

function humanizeFeatureKey(key: keyof AudioFeatures) {
  return `${key}`
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
