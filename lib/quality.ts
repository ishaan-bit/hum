import { AUDIO_PIPELINE_THRESHOLDS, QUALITY_GATE_MODE } from "@/lib/audioThresholds";
import { getExpressionFilterMetrics } from "@/lib/audioFeatures";
import { isHumDebugEnabled } from "@/lib/humDebug";
import type { AudioFeatures, CaptureQuality, HumQuality, HumSession } from "@/types/hum";

export type HumQualityResult = {
  quality: HumQuality;
  captureQuality: CaptureQuality;
  confidenceWeight: number;
  title: string | null;
  message: string | null;
  reason: string;
  failedGate: string | null;
  flags: string[];
  captureReasons: string[];
  stateReasons: string[];
  shouldEnterBaseline: boolean;
  shouldGenerateRecommendation: boolean;
};

type QualityGateDecision = "rejected" | "poor" | "soft" | "usable" | "good";
type QualityGateAssessment = {
  decision: QualityGateDecision;
  captureQuality: CaptureQuality;
  reason: string;
  failedGate: string | null;
  flags: string[];
  captureReasons: string[];
  stateReasons: string[];
};

export function assessHumQuality(features: AudioFeatures, sessions: HumSession[] = []): HumQualityResult {
  const baselineRms = getLoudnessBaselineRms(sessions);
  const currentRms = getDecisionRms(features);
  const normalizedLoudness = baselineRms === null ? null : currentRms / baselineRms;
  const assessment = getQualityGateDecision(features, currentRms, baselineRms, normalizedLoudness, sessions);
  const result = getQualityResult(assessment);

  debugQualityDecision(features, {
    baselineRms,
    normalizedLoudness,
    qualityDecision: result.quality,
    captureQuality: result.captureQuality,
    decision: assessment.decision,
    reason: assessment.reason,
    failedGate: assessment.failedGate,
  });

  return result;
}

export function getLoudnessBaselineRms(sessions: HumSession[]) {
  const recentRmsValues = sessions
    .filter(
      (session) =>
        session.features &&
        session.quality === "clean" &&
        session.captureQuality !== "poor" &&
        session.captureQuality !== "rejected" &&
        !session.features.isSilent &&
        !isTechnicallyFaint(session.features),
    )
    .slice(0, AUDIO_PIPELINE_THRESHOLDS.baselineSampleCount)
    .map((session) => getDecisionRms(session.features))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);

  if (recentRmsValues.length < AUDIO_PIPELINE_THRESHOLDS.baselineMinimumCount) return null;
  return percentile(recentRmsValues, 0.5);
}

function getQualityGateDecision(
  features: AudioFeatures,
  currentRms: number,
  baselineRms: number | null,
  normalizedLoudness: number | null,
  sessions: HumSession[],
): QualityGateAssessment {
  const gate = AUDIO_PIPELINE_THRESHOLDS.qualityGate;
  const baselineReady = sessions.filter((session) => session.quality === "clean" || session.quality === "borderline").length >= 5;
  const stateReasons = getVocalStateReasons(features, { baselineReady });

  if (features.duration < gate.minimumDurationSec) {
    return rejected("too short", `duration < ${gate.minimumDurationSec}`, ["too-short"], [
      `duration ${features.duration.toFixed(2)}s is shorter than ${gate.minimumDurationSec}s`,
    ], stateReasons);
  }

  if (features.isSilent || features.meanRms <= gate.nearSilenceMeanRms) {
    return rejected("too quiet", `meanRms <= ${gate.nearSilenceMeanRms}`, ["near-silent", "very-low-rms"], [
      "near-silent audio",
    ], stateReasons);
  }

  if (features.clippedFrameRatio > AUDIO_PIPELINE_THRESHOLDS.maximumClippedFrameRatio) {
    return poor("clipped", `clippedFrameRatio > ${AUDIO_PIPELINE_THRESHOLDS.maximumClippedFrameRatio}`, ["clipping"], [
      "too many clipped frames",
    ], stateReasons);
  }

  if (features.silenceRatio > gate.maximumSilenceRatio) {
    return poor("too interrupted", `silenceRatio > ${gate.maximumSilenceRatio}`, ["excessive-silence"], [
      "too much silence or interruption",
    ], stateReasons);
  }

  if (
    features.quietFrameRatio > AUDIO_PIPELINE_THRESHOLDS.maximumQuietFrameRatio &&
    !isForgivingBaselineCapture(features, baselineReady)
  ) {
    return poor("too quiet", `quietFrameRatio > ${AUDIO_PIPELINE_THRESHOLDS.maximumQuietFrameRatio}`, ["mostly-quiet"], [
      "too many very quiet frames",
    ], stateReasons);
  }

  if (features.activeFrameRatio < gate.minimumActiveFrameRatio) {
    return poor("too interrupted", `activeFrameRatio < ${gate.minimumActiveFrameRatio}`, ["low-active-audio"], [
      "too little continuous hum audio",
    ], stateReasons);
  }

  if (features.pitchCoverage !== null && features.pitchCoverage < gate.minimumPitchCoverage) {
    return poor("not enough voiced hum", `pitchCoverage < ${gate.minimumPitchCoverage}`, ["poor-voiced-coverage"], [
      "too little voiced hum audio",
    ], stateReasons);
  }

  if (isPoorSnr(features)) {
    return poor(
      "too noisy",
      "signalToNoiseProxy too low",
      ["poor-snr"],
      ["hum could not be separated from room noise"],
      stateReasons,
    );
  }

  if (isPeakBarelyAboveNoise(features, baselineReady)) {
    return poor(
      "background too close to hum",
      "peakAmplitude barely above noise floor",
      ["poor-snr", "low-signal-noise-separation"],
      ["background level was too close to the hum"],
      stateReasons,
    );
  }

  const captureReasons = getCaptureReasons(features);
  const usabilityFlags = getUsabilityFlags(features);
  const softByAbsoluteLevel = currentRms < gate.softRms || isTechnicallyFaint(features);
  const softByBaseline = baselineRms !== null && normalizedLoudness !== null && normalizedLoudness < gate.softBaselineRatio;

  if (softByAbsoluteLevel || softByBaseline) {
    return {
      decision: "soft",
      captureQuality: "soft_usable",
      reason: "soft but usable",
      failedGate: softByBaseline ? `normalizedLoudness < ${gate.softBaselineRatio}` : null,
      flags: ["soft-usable", ...usabilityFlags],
      captureReasons: [...captureReasons, "soft level, but usable capture"],
      stateReasons,
    };
  }

  if (hasGoodCapture(features, currentRms)) {
    return {
      decision: "good",
      captureQuality: "good",
      reason: "good capture",
      failedGate: null,
      flags: ["good-capture", ...usabilityFlags],
      captureReasons: [...captureReasons, "strong usable capture"],
      stateReasons,
    };
  }

  return {
    decision: "usable",
    captureQuality: "usable",
    reason: usabilityFlags.length ? "usable with minor capture notes" : "usable capture",
    failedGate: null,
    flags: ["usable-capture", ...usabilityFlags],
    captureReasons,
    stateReasons,
  };
}

function rejected(
  reason: string,
  failedGate: string,
  flags: string[],
  captureReasons: string[],
  stateReasons: string[],
): QualityGateAssessment {
  return { decision: "rejected", captureQuality: "rejected", reason, failedGate, flags, captureReasons, stateReasons };
}

function poor(
  reason: string,
  failedGate: string,
  flags: string[],
  captureReasons: string[],
  stateReasons: string[],
): QualityGateAssessment {
  return { decision: "poor", captureQuality: "poor", reason, failedGate, flags, captureReasons, stateReasons };
}

function getDecisionRms(features: AudioFeatures) {
  return features.medianRms || features.meanRms || features.inputRms || 0;
}

function getQualityResult(assessment: QualityGateAssessment): HumQualityResult {
  if (assessment.decision === "rejected" || assessment.decision === "poor") {
    const copy = getRejectedCaptureCopy(assessment.reason);
    return {
      quality: "rejected",
      captureQuality: assessment.captureQuality,
      confidenceWeight: 0,
      title: copy.title,
      message: copy.message,
      reason: assessment.reason,
      failedGate: assessment.failedGate,
      flags: assessment.flags,
      captureReasons: assessment.captureReasons,
      stateReasons: assessment.stateReasons,
      shouldEnterBaseline: false,
      shouldGenerateRecommendation: false,
    };
  }

  if (assessment.decision === "soft") {
    return {
      quality: "borderline",
      captureQuality: "soft_usable",
      confidenceWeight: 0.72,
      title: null,
      message: "Captured. Softer than usual, but usable.",
      reason: assessment.reason,
      failedGate: assessment.failedGate,
      flags: assessment.flags,
      captureReasons: assessment.captureReasons,
      stateReasons: assessment.stateReasons,
      shouldEnterBaseline: true,
      shouldGenerateRecommendation: true,
    };
  }

  return {
    quality: "clean",
    captureQuality: assessment.captureQuality,
    confidenceWeight: assessment.decision === "good" ? 1 : 0.95,
    title: null,
    message: null,
    reason: assessment.reason,
    failedGate: assessment.failedGate,
    flags: assessment.flags,
    captureReasons: assessment.captureReasons,
    stateReasons: assessment.stateReasons,
    shouldEnterBaseline: true,
    shouldGenerateRecommendation: true,
  };
}

export function getRejectedCaptureCopy(reason: string) {
  if (reason === "too short") {
    return {
      title: "Too short to read clearly.",
      message: "Try one full 12-second hum.",
    };
  }

  if (reason === "clipped") {
    return {
      title: "That recording overloaded the mic.",
      message: "Try a little farther from the mic.",
    };
  }

  if (reason === "too quiet") {
    return {
      title: "Too quiet to read clearly.",
      message: "Bring the phone a little closer and hum normally.",
    };
  }

  if (reason === "too interrupted") {
    return {
      title: "Too many breaks.",
      message: "Hold one steady tone, even if it is soft.",
    };
  }

  if (reason === "not enough voiced hum") {
    return {
      title: "Not enough steady hum.",
      message: "Keep the hum continuous so Hum can follow the pitch.",
    };
  }

  if (reason === "background too close to hum") {
    return {
      title: "The level was okay, but background noise made the hum hard to separate.",
      message: "Try a quieter spot with the same comfortable volume.",
    };
  }

  if (reason === "too noisy") {
    return {
      title: "Too much room noise.",
      message: "Find a quieter spot and try one steady tone.",
    };
  }

  return {
    title: "Could not read that clearly.",
    message: "Try one steady hum closer to the mic.",
  };
}

function getUsabilityFlags(features: AudioFeatures) {
  return [
    features.silenceRatio > 0.28 || features.quietFrameRatio > 0.35 ? "moderate-quiet-space" : null,
    features.pitchCoverage !== null && features.pitchCoverage < 0.72 ? "moderate-voiced-coverage" : null,
  ].filter((flag): flag is string => flag !== null);
}

function getCaptureReasons(features: AudioFeatures) {
  return [
    `duration ${features.duration.toFixed(2)}s`,
    `active frames ${(features.activeFrameRatio * 100).toFixed(1)}%`,
    features.pitchCoverage !== null ? `voiced ${(features.pitchCoverage * 100).toFixed(1)}%` : null,
    `silence ${(features.silenceRatio * 100).toFixed(1)}%`,
    `quiet frames ${(features.quietFrameRatio * 100).toFixed(1)}%`,
    features.signalToNoiseProxy !== null ? `SNR proxy ${features.signalToNoiseProxy.toFixed(2)}` : null,
    `peak ${features.peakAmplitude.toFixed(4)}`,
  ].filter((reason): reason is string => reason !== null);
}

export function getVocalStateReasons(features: AudioFeatures, options: { baselineReady?: boolean } = {}) {
  const expression = getExpressionFilterMetrics(features);
  const cleanContinuous =
    expression.stableSegmentCoverage > 0.8 &&
    (features.pitchCoverage ?? 0) > 0.85 &&
    features.activeFrameRatio > 0.75 &&
    features.breakCount === 0 &&
    features.pauseCount === 0;

  if (!options.baselineReady) {
    return [
      cleanContinuous ? "Clean continuous hum captured." : "Useful calibration hum.",
      expression.musicalityScore >= 0.38 ? "Expressive pitch movement detected." : null,
      "Still learning your usual pattern.",
    ].filter((reason): reason is string => reason !== null);
  }

  const positiveReasons = [
    cleanContinuous ? "clean continuous hum" : null,
    expression.controlledExpressionScore >= 0.7 ? "controlled sustained tone" : null,
    expression.musicalityScore >= 0.55 ? "expressive pitch contour" : null,
    expression.melodicContourInterpretation === "Song-like contour" ? "melodic movement detected" : null,
    expression.vibratoInterpretation === "Structured / periodic" ||
    expression.glideInterpretation === "Smooth slide"
      ? "structured vibrato/glide detected"
      : null,
    expression.volumeEnvelopeInterpretation === "Phrase-like movement" ? "volume movement appears phrase-like" : null,
    expression.residualPitchInstability < 0.35 ? "residual pitch instability was low" : null,
    expression.residualAmplitudeInstability < 0.35 ? "residual volume instability was low" : null,
  ];
  const negativeReasons = [
    expression.residualPitchInstability >= 0.62 ? "irregular pitch scatter after musical filtering" : null,
    expression.residualAmplitudeInstability >= 0.62 ? "random volume shimmer after envelope filtering" : null,
    features.breakCount > 0 ? "broken voicing" : null,
    features.pauseCount > 2 || features.microBreakRatio > 0.08 ? "frequent internal dropouts" : null,
    (features.breathinessProxy ?? 0) > 0.65 && (features.clarityScore ?? 1) < 0.55 ? "noisy breath-heavy capture" : null,
    expression.residualInstabilityScore >= 0.68 ? "unstable contour not explained by melody/vibrato/glide" : null,
  ];

  return [...positiveReasons, ...negativeReasons].filter((reason): reason is string => reason !== null);
}

function hasGoodCapture(features: AudioFeatures, currentRms: number) {
  return (
    currentRms >= AUDIO_PIPELINE_THRESHOLDS.qualityGate.strongRms ||
    (features.activeFrameRatio >= 0.78 &&
      (features.pitchCoverage ?? 1) >= 0.65 &&
      features.silenceRatio <= 0.18 &&
      features.quietFrameRatio <= 0.15 &&
      (features.signalToNoiseProxy ?? 4) >= 4 &&
      features.peakAmplitude >= 0.08)
  );
}

function isTechnicallyFaint(features: AudioFeatures) {
  return (
    features.isTooFaint &&
    (features.activeFrameRatio < 0.6 ||
      (features.pitchCoverage !== null && features.pitchCoverage < 0.5) ||
      isPoorSnr(features) ||
      features.peakAmplitude < 0.035)
  );
}

function isPoorSnr(features: AudioFeatures) {
  return features.signalToNoiseProxy !== null && features.signalToNoiseProxy < 2;
}

function isPeakBarelyAboveNoise(features: AudioFeatures, baselineReady: boolean) {
  if (features.peakAmplitude < 0.025) return !isForgivingBaselineCapture(features, baselineReady);
  if (features.noiseFloorRms <= 0) return false;
  const snrIsWeakOrUnknown = features.signalToNoiseProxy === null || features.signalToNoiseProxy < 2.5;
  return snrIsWeakOrUnknown && features.peakAmplitude / features.noiseFloorRms < 3;
}

function isForgivingBaselineCapture(features: AudioFeatures, baselineReady: boolean) {
  if (baselineReady) return false;

  return (
    features.meanRms > AUDIO_PIPELINE_THRESHOLDS.qualityGate.nearSilenceMeanRms &&
    features.peakAmplitude >= AUDIO_PIPELINE_THRESHOLDS.basicallySilentPeak &&
    features.activeFrameRatio >= 0.55 &&
    features.silenceRatio <= 0.45 &&
    (features.pitchCoverage === null || features.pitchCoverage >= 0.5) &&
    (features.signalToNoiseProxy === null || features.signalToNoiseProxy >= 2.5)
  );
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (!sortedValues.length) return 0;
  const index = (sortedValues.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function debugQualityDecision(
  features: AudioFeatures,
  decision: {
    baselineRms: number | null;
    normalizedLoudness: number | null;
    qualityDecision: HumQuality;
    captureQuality: CaptureQuality;
    decision: QualityGateDecision;
    reason: string;
    failedGate: string | null;
  },
) {
  if (!isHumDebugEnabled()) return;

  const logRow = {
    durationSec: features.duration,
    meanRms: features.meanRms,
    medianRms: features.medianRms,
    activeFrameRatio: features.activeFrameRatio,
    quietFrameRatio: features.quietFrameRatio,
    signalToNoiseProxy: features.signalToNoiseProxy,
    peakAmplitude: features.peakAmplitude,
    baselineRms: decision.baselineRms,
    normalizedLoudness: decision.normalizedLoudness,
    decision: decision.decision,
    captureQuality: decision.captureQuality,
    reason: decision.reason,
    failedGate: decision.failedGate,
  };

  if (decision.qualityDecision === "rejected") {
    console.table(logRow);
    return;
  }

  console.info("[Hum quality decision]", {
    mode: QUALITY_GATE_MODE,
    ...logRow,
  });
}
