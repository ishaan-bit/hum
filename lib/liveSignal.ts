import { AUDIO_PIPELINE_THRESHOLDS } from "@/lib/audioThresholds";

export type SignalQuality = "silent" | "faint" | "usable" | "strong" | "clipping";
export type LiveFeedbackBand =
  | "too_quiet"
  | "too_loud"
  | "too_noisy"
  | "level_ok_background"
  | "too_interrupted"
  | "fair"
  | "good";

export type LiveSignalMetrics = {
  rawRms: number;
  smoothedRms: number;
  peakAmplitude: number;
  db: number;
  meterLevel: number;
  isClipping: boolean;
};

export type LiveQualityEstimate = {
  band: LiveFeedbackBand;
  averageLevelBand: SignalQuality;
  meanRms: number;
  activeFrameRatio: number;
  quietFrameRatio: number;
  noiseFloorRms: number;
  signalToNoiseProxy: number | null;
  interruptionEstimate: number;
};

const MIN_AUDIBLE_DB = -62;
const FULL_METER_DB = -26;
const SILENCE_RMS = AUDIO_PIPELINE_THRESHOLDS.basicallySilentRms;
const FAINT_RMS = AUDIO_PIPELINE_THRESHOLDS.absoluteActiveRms;
const STRONG_RMS = 0.07;
const CLIPPING_PEAK = 0.96;
const CLIPPING_RMS = 0.22;

export function getLiveSignalMetrics(rawRms: number, smoothedRms: number, peakAmplitude: number): LiveSignalMetrics {
  const safeRms = Math.max(0, rawRms);
  const db = rmsToDb(safeRms);
  const dbProgress = clamp((db - MIN_AUDIBLE_DB) / (FULL_METER_DB - MIN_AUDIBLE_DB), 0, 1);
  const perceived = Math.pow(dbProgress, 0.68);
  const silenceGate = safeRms < SILENCE_RMS && peakAmplitude < 0.035;
  const meterLevel = silenceGate ? Math.min(perceived, 0.16) : clamp(perceived, 0.18, 1);

  return {
    rawRms: safeRms,
    smoothedRms: Math.max(0, smoothedRms),
    peakAmplitude: Math.max(0, peakAmplitude),
    db,
    meterLevel,
    isClipping: peakAmplitude >= CLIPPING_PEAK || safeRms >= CLIPPING_RMS,
  };
}

export function getSignalQuality(metrics: LiveSignalMetrics, current: SignalQuality): SignalQuality {
  const rms = metrics.smoothedRms || metrics.rawRms;

  if (current === "clipping") {
    if (metrics.peakAmplitude > 0.9 || rms > 0.16) return "clipping";
  } else if (metrics.isClipping) {
    return "clipping";
  }

  if (current === "strong") {
    if (rms >= STRONG_RMS * 0.72 && !metrics.isClipping) return "strong";
  } else if (rms >= STRONG_RMS) {
    return "strong";
  }

  if (current === "usable") {
    if (rms >= FAINT_RMS * 0.75 && rms < STRONG_RMS * 1.12) return "usable";
  } else if (rms >= FAINT_RMS) {
    return "usable";
  }

  if (current === "faint") {
    if (rms >= SILENCE_RMS * 0.72 && rms < FAINT_RMS * 1.18) return "faint";
  } else if (rms >= SILENCE_RMS) {
    return "faint";
  }

  return "silent";
}

export function getSignalQualityCopy(quality: SignalQuality) {
  if (quality === "clipping") return { label: "Too loud", hint: "Ease back slightly" };
  if (quality === "strong") return { label: "Good level", hint: "Hold one steady tone" };
  if (quality === "usable") return { label: "Level looks good", hint: "Keep it steady" };
  if (quality === "faint") return { label: "Soft signal", hint: "Keep one steady tone" };
  return { label: "Waiting for hum", hint: "Start one steady tone" };
}

export function getLiveQualityEstimate(
  metrics: LiveSignalMetrics,
  rollingRms: number[],
  currentQuality: SignalQuality = "silent",
): LiveQualityEstimate {
  const values = rollingRms.length ? rollingRms.filter(Number.isFinite).map((value) => Math.max(0, value)) : [metrics.rawRms];
  const loudness = getRollingLoudness(values);
  const gate = AUDIO_PIPELINE_THRESHOLDS.qualityGate;
  const meanRms = loudness.meanRms || metrics.smoothedRms || metrics.rawRms;
  const signalToNoiseProxy = loudness.noiseFloorRms > 0 ? meanRms / Math.max(loudness.noiseFloorRms, 0.0001) : null;
  const hasNoiseReference = loudness.quietFrameRatio > 0.08 || loudness.rmsSpread > meanRms * 0.2;
  const interruptionEstimate = Math.max(1 - loudness.activeFrameRatio, loudness.quietFrameRatio);
  const averageMetrics = getLiveSignalMetrics(meanRms, meanRms, metrics.peakAmplitude);
  const averageLevelBand = getSignalQuality(averageMetrics, currentQuality);
  const hasEnoughRollingSignal = values.length >= 18;

  let band: LiveFeedbackBand = "too_quiet";
  if (metrics.isClipping) {
    band = "too_loud";
  } else if (meanRms <= gate.nearSilenceMeanRms || averageLevelBand === "silent") {
    band = "too_quiet";
  } else if (
    hasEnoughRollingSignal &&
    (loudness.activeFrameRatio < gate.minimumActiveFrameRatio ||
      loudness.quietFrameRatio > AUDIO_PIPELINE_THRESHOLDS.maximumQuietFrameRatio)
  ) {
    band = "too_interrupted";
  } else if (
    hasEnoughRollingSignal &&
    signalToNoiseProxy !== null &&
    hasNoiseReference &&
    signalToNoiseProxy < 2 &&
    loudness.noiseFloorRms >= AUDIO_PIPELINE_THRESHOLDS.absoluteQuietRms
  ) {
    band = "too_noisy";
  } else if (
    hasEnoughRollingSignal &&
    signalToNoiseProxy !== null &&
    hasNoiseReference &&
    signalToNoiseProxy < 2.5 &&
    loudness.noiseFloorRms >= AUDIO_PIPELINE_THRESHOLDS.absoluteQuietRms
  ) {
    band = "level_ok_background";
  } else if (
    meanRms >= gate.softRms &&
    loudness.activeFrameRatio >= 0.55 &&
    loudness.quietFrameRatio <= 0.45 &&
    (!hasNoiseReference || signalToNoiseProxy === null || signalToNoiseProxy >= 2.5)
  ) {
    band = "good";
  } else {
    band = "fair";
  }

  return {
    band,
    averageLevelBand,
    meanRms,
    activeFrameRatio: loudness.activeFrameRatio,
    quietFrameRatio: loudness.quietFrameRatio,
    noiseFloorRms: loudness.noiseFloorRms,
    signalToNoiseProxy,
    interruptionEstimate,
  };
}

export function getLiveFeedbackCopy(band: LiveFeedbackBand) {
  if (band === "too_loud") return { label: "Too loud", hint: "Ease back slightly" };
  if (band === "too_noisy") return { label: "Find a quieter spot", hint: "Less background would help" };
  if (band === "level_ok_background") {
    return { label: "Level is okay", hint: "Background may interfere" };
  }
  if (band === "too_interrupted") return { label: "Hold one steady tone", hint: "Keep the hum continuous" };
  if (band === "good") return { label: "Good level", hint: "Keep it steady" };
  if (band === "fair") return { label: "Steady hum", hint: "Keep one comfortable tone" };
  return { label: "Waiting for hum", hint: "Start one steady tone" };
}

export function getFallbackLiveSignalMetrics(level: number): LiveSignalMetrics {
  const meterLevel = clamp(level, 0, 1);
  const estimatedRms = Math.pow(meterLevel, 1.47) * (FULL_METER_DB - MIN_AUDIBLE_DB);
  const db = MIN_AUDIBLE_DB + estimatedRms;
  const rawRms = Math.pow(10, db / 20);

  return {
    rawRms,
    smoothedRms: rawRms,
    peakAmplitude: Math.min(1, rawRms * 4.5),
    db,
    meterLevel,
    isClipping: meterLevel >= 0.96,
  };
}

function rmsToDb(rms: number) {
  return 20 * Math.log10(Math.max(rms, 0.00001));
}

function getRollingLoudness(values: number[]) {
  const sortedRms = [...values].sort((left, right) => left - right);
  const noiseFrameCount = Math.max(
    1,
    Math.min(
      sortedRms.length,
      Math.ceil(AUDIO_PIPELINE_THRESHOLDS.noiseFloorMs / AUDIO_PIPELINE_THRESHOLDS.rmsWindowMs),
    ),
  );
  const quietestFrames = sortedRms.slice(0, noiseFrameCount);
  const medianRms = sortedRms.length ? percentile(sortedRms, 0.5) : 0;
  const p10Rms = sortedRms.length ? percentile(sortedRms, 0.1) : 0;
  const p90Rms = sortedRms.length ? percentile(sortedRms, 0.9) : 0;
  const noiseFloorRms = quietestFrames.length ? percentile(quietestFrames, 0.5) : 0;
  const activeThreshold = Math.max(
    AUDIO_PIPELINE_THRESHOLDS.absoluteActiveRms,
    Math.min(
      noiseFloorRms * AUDIO_PIPELINE_THRESHOLDS.activeNoiseMultiplier,
      medianRms * AUDIO_PIPELINE_THRESHOLDS.activeMedianCapRatio,
    ),
  );
  const quietThreshold = Math.max(
    AUDIO_PIPELINE_THRESHOLDS.absoluteQuietRms,
    Math.min(
      noiseFloorRms * AUDIO_PIPELINE_THRESHOLDS.quietNoiseMultiplier,
      medianRms * AUDIO_PIPELINE_THRESHOLDS.quietMedianCapRatio,
    ),
  );

  return {
    meanRms: average(values),
    medianRms,
    activeFrameRatio: ratio(values, (value) => value >= activeThreshold),
    quietFrameRatio: ratio(values, (value) => value <= quietThreshold),
    noiseFloorRms,
    rmsSpread: p90Rms - p10Rms,
  };
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function ratio(values: number[], predicate: (value: number) => boolean) {
  if (!values.length) return 0;
  return values.filter(predicate).length / values.length;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
