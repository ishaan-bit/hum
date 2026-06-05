"use client";

import { getBaselineEligibility } from "@/lib/baselineEligibility";
import { getVocalStateReasons } from "@/lib/quality";
import {
  getBaseline,
  getBaselineProgress,
  getIndicatorFormulaAudit,
  getSignalType,
} from "@/lib/recommendation";
import { getRecordingAttemptDiagnostics } from "@/lib/recordingAttempt";
import { getHumStorageDebugSummary, getSessions, getThreadReadFeedback } from "@/lib/storage";
import { buildThreadInsight } from "@/lib/threadInsight";
import type { AudioFeatures, HumSession } from "@/types/hum";

type AuditRow = ReturnType<typeof buildAuditRow>;
type DistributionKey =
  | "inputRms"
  | "meanRms"
  | "peakAmplitude"
  | "quietFrameRatio"
  | "pitchRange"
  | "jitter"
  | "pauseCount"
  | "microBreakRatio"
  | "energyMeter"
  | "stabilityMeter"
  | "movementMeter";

const distributionKeys: DistributionKey[] = [
  "inputRms",
  "meanRms",
  "peakAmplitude",
  "quietFrameRatio",
  "pitchRange",
  "jitter",
  "pauseCount",
  "microBreakRatio",
  "energyMeter",
  "stabilityMeter",
  "movementMeter",
];

export function installHumDebugConsole() {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return;

  window.__HUM_DEBUG__ = {
    ...(window.__HUM_DEBUG__ ?? {}),
    auditSessions,
    getRecordingAttemptDiagnostics,
    printMeterFormulas,
    printBaselineStatus,
    printThreadInsight,
  };
}

export function auditSessions() {
  const sessions = getSessions();
  const baseline = getBaseline(sessions);
  const rows = sessions.map((session) => buildAuditRow(session, baseline));
  const distributions = getDistributionStats(rows);
  const groups = compareAcceptedRejected(rows);
  const warnings = rows.flatMap((row) => row.warnings.map((warning) => ({ sessionId: row.sessionId, warning })));
  const baselineStatus = getBaselineStatus(sessions);

  console.group("[Hum debug] session audit");
  console.info("Storage", getHumStorageDebugSummary());
  console.table(rows.map(toCompactConsoleRow));
  console.info("Distribution stats", distributions);
  console.info("Accepted vs rejected", groups);
  console.info("Baseline status", baselineStatus);
  console.info("Thread insight", buildThreadInsight({ sessions, readFeedback: getThreadReadFeedback() }).debug);
  if (warnings.length) console.table(warnings);
  console.groupEnd();

  return {
    storage: getHumStorageDebugSummary(),
    rows,
    distributions,
    groups,
    warnings,
    baselineStatus,
    threadInsight: buildThreadInsight({ sessions, readFeedback: getThreadReadFeedback() }).debug,
    meterFormulas: getMeterFormulaDocumentation(),
  };
}

export function printThreadInsight() {
  const insight = buildThreadInsight({ sessions: getSessions(), readFeedback: getThreadReadFeedback() });
  console.group("[Hum thread insight]");
  console.info(insight.debug);
  console.groupEnd();
  return insight;
}

export function printMeterFormulas() {
  const formulas = getMeterFormulaDocumentation();
  console.group("[Hum debug] meter formulas");
  console.info(formulas);
  console.groupEnd();
  return formulas;
}

export function printBaselineStatus() {
  const status = getBaselineStatus(getSessions());
  console.group("[Hum debug] baseline status");
  console.info(`Baseline eligible sessions: ${status.baselineEligibleSessions}`);
  console.info(`Baseline stored sessions: ${status.baselineStoredSessions}`);
  console.info(`UI baseline count source: ${status.uiBaselineCountSource}`);
  console.table(status.sessions);
  console.groupEnd();
  return status;
}

function buildAuditRow(session: HumSession, currentBaseline: ReturnType<typeof getBaseline>) {
  const features = session.features ?? ({} as AudioFeatures);
  const baselineEligibility = getBaselineEligibility(session);
  const meterAudit = getIndicatorFormulaAudit(features, currentBaseline);
  const usedForRecommendation = session.shouldGenerateRecommendation ?? Boolean(session.musicRecommendation);
  const stateReasons = session.stateReasons?.length ? session.stateReasons : getVocalStateReasons(features);
  const warnings = getAuditWarnings(session, meterAudit, baselineEligibility.eligible, stateReasons);

  return {
    sessionId: session.sessionId ?? session.id ?? null,
    timestamp: session.createdAt ?? null,
    duration: finite(features.duration),
    qualityStatus: session.captureQuality ?? session.qualityDecision?.captureQuality ?? session.quality ?? null,
    quality: session.quality ?? null,
    classificationLabel: session.signal ?? null,
    signalType: session.signalType ?? getSignalType(session.signal),
    baselineAccepted: baselineEligibility.eligible,
    baselineEligibilityReason: baselineEligibility.reason,
    usedForRecommendation,
    inputRms: finite(features.inputRms),
    meanRms: finite(features.meanRms),
    rmsEnergy: finite(features.rmsEnergy),
    peakAmplitude: finite(features.peakAmplitude),
    quietFrameRatio: finite(features.quietFrameRatio),
    voicedRatio: finite(features.pitchCoverage),
    pitchHz: finite(features.pitchMean ?? features.pitchHz),
    pitchRange: finite(features.pitchRange),
    pitchVariance: finite(features.pitchVariance),
    pitchStability: finite(features.pitchStability),
    jitter: finite(features.jitter),
    smoothness: finite(features.smoothnessScore),
    longestStableSegment: finite(features.longestStableSegment),
    breaks: finite(features.breakCount),
    pauseCount: finite(features.pauseCount),
    avgPauseLength: finite(features.avgPauseLength),
    microBreakRatio: finite(features.microBreakRatio),
    silenceRatio: finite(features.silenceRatio),
    activeFrameRatio: finite(features.activeFrameRatio),
    energyMeter: meterAudit.bars.energy,
    stabilityMeter: meterAudit.bars.stability,
    movementMeter: meterAudit.bars.movement,
    meterMode: meterAudit.mode,
    meterAudit,
    stateReasons,
    warnings,
  };
}

function toCompactConsoleRow(row: AuditRow) {
  return {
    sessionId: row.sessionId,
    timestamp: row.timestamp,
    duration: row.duration,
    quality: row.qualityStatus,
    label: row.classificationLabel,
    baseline: row.baselineAccepted,
    recommend: row.usedForRecommendation,
    input: row.inputRms,
    rms: row.meanRms,
    peak: row.peakAmplitude,
    quietPct: percent(row.quietFrameRatio),
    voicedPct: percent(row.voicedRatio),
    pitchHz: row.pitchHz,
    pitchRange: row.pitchRange,
    pitchVariance: row.pitchVariance,
    jitter: row.jitter,
    smoothness: row.smoothness,
    stableSec: row.longestStableSegment,
    breaks: row.breaks,
    pauses: row.pauseCount,
    avgPause: row.avgPauseLength,
    microBreakPct: percent(row.microBreakRatio),
    energy: row.energyMeter,
    stability: row.stabilityMeter,
    movement: row.movementMeter,
    warnings: row.warnings.join("; "),
  };
}

function getAuditWarnings(
  session: HumSession,
  meterAudit: ReturnType<typeof getIndicatorFormulaAudit>,
  baselineEligible: boolean,
  stateReasons: string[],
) {
  const features = session.features;
  const warnings: string[] = [];

  if (features.peakAmplitude >= 0.08 && meterAudit.bars.energy <= 2) {
    warnings.push("Energy mismatch: peak amplitude usable but energy meter low");
  }
  if ((features.pitchMean !== null || features.pitchHz !== null) && session.captureQuality === "soft_usable") {
    warnings.push("Pitch detected but capture is marked soft usable");
  }
  if (
    features.duration >= 8 &&
    (session.captureQuality === "rejected" || session.qualityDecision?.decision === "rejected")
  ) {
    warnings.push("Duration acceptable but session rejected");
  }
  if (features.pauseCount >= 4 && features.quietFrameRatio < 0.25) {
    warnings.push("Pause sensitivity: high pause count with low quiet percentage");
  }
  if ((features.pitchVariance ?? 0) > 1000 && meterAudit.bars.movement >= 4) {
    warnings.push("Pitch variance unbounded: check normalization before meter mapping");
  }
  if (
    meterAudit.bars.stability <= 2 &&
    features.pitchCoverage !== null &&
    features.pitchCoverage < 0.55 &&
    features.quietFrameRatio < 0.25
  ) {
    warnings.push("Stability may be low because of pitch-tracking dropouts");
  }
  if ((session.shouldEnterBaseline ?? session.captureQuality !== "rejected") && !baselineEligible) {
    warnings.push("Baseline mismatch: accepted session not counted toward baseline");
  }
  if (meterAudit.bars.energy <= 2 && session.signal === "More activated than usual") {
    warnings.push("Displayed meter score disagrees with activated classification label");
  }
  if (meterAudit.bars.stability <= 2 && session.signal === "Steadier than usual") {
    warnings.push("Displayed meter score disagrees with steady classification label");
  }
  if (meterAudit.bars.movement >= 4 && session.signal === "Flatter than usual") {
    warnings.push("Displayed meter score disagrees with flatter classification label");
  }
  if (stateReasons.some((reason) => reason.includes("pauses")) && features.quietFrameRatio < 0.25) {
    warnings.push("Pause sensitivity: state reasons cite pauses but quiet percentage is low");
  }

  return warnings;
}

function getDistributionStats(rows: AuditRow[]) {
  return Object.fromEntries(distributionKeys.map((key) => [key, summarize(rows.map((row) => row[key]))]));
}

function compareAcceptedRejected(rows: AuditRow[]) {
  const accepted = rows.filter((row) => row.qualityStatus !== "poor" && row.qualityStatus !== "rejected");
  const rejected = rows.filter((row) => row.qualityStatus === "poor" || row.qualityStatus === "rejected");
  return {
    acceptedUsableHums: averageGroup(accepted),
    rejectedLowQualityHums: averageGroup(rejected),
  };
}

function averageGroup(rows: AuditRow[]) {
  return {
    count: rows.length,
    duration: averageNullable(rows.map((row) => row.duration)),
    inputRms: averageNullable(rows.map((row) => row.inputRms)),
    meanRms: averageNullable(rows.map((row) => row.meanRms)),
    peakAmplitude: averageNullable(rows.map((row) => row.peakAmplitude)),
    quietFrameRatio: averageNullable(rows.map((row) => row.quietFrameRatio)),
    voicedRatio: averageNullable(rows.map((row) => row.voicedRatio)),
    pitchTrackability: averageNullable(rows.map((row) => row.voicedRatio)),
    breaks: averageNullable(rows.map((row) => row.breaks)),
    pauseCount: averageNullable(rows.map((row) => row.pauseCount)),
    energyMeter: averageNullable(rows.map((row) => row.energyMeter)),
    stabilityMeter: averageNullable(rows.map((row) => row.stabilityMeter)),
    movementMeter: averageNullable(rows.map((row) => row.movementMeter)),
  };
}

function getBaselineStatus(sessions: HumSession[]) {
  const baseline = getBaseline(sessions);
  const rows = sessions.map((session) => {
    const eligibility = getBaselineEligibility(session);
    return {
      sessionId: session.sessionId,
      quality: session.quality,
      captureQuality: session.captureQuality ?? session.qualityDecision?.captureQuality ?? null,
      includedInBaseline: session.includedInBaseline,
      recomputedEligible: eligibility.eligible,
      reason: eligibility.reason,
    };
  });
  const eligibleCount = rows.filter((row) => row.recomputedEligible).length;

  return {
    baselineEligibleSessions: eligibleCount,
    baselineStoredSessions: baseline?.validBaselineCount ?? 0,
    uiBaselineCountSource: getBaselineProgress(sessions),
    storage: getHumStorageDebugSummary(),
    sessions: rows,
  };
}

function getMeterFormulaDocumentation() {
  return {
    storage: {
      primarySessionKey: "hum:sessions",
      reader: "getSessions() scans localStorage and sessionStorage for records containing feature objects, preferring hum:sessions on duplicate identities.",
      savedShape:
        "HumSession: id, sessionId, createdAt, features, quality, qualityDecision, captureQuality, captureReasons, stateReasons, confidenceWeight, baseline fields, signal fields, musicRecommendation, musicSession, action, feedback, metadata, mlData, consent fields.",
    },
    energy: {
      absolute:
        "No baseline: bars = toBars(clamp(inputRms / 0.06, 0, 1)). Peak amplitude, mean RMS, voiced ratio, and quiet percent are visible in details but not used.",
      baselineRelative:
        "With baseline: energyRelative = inputRms / baseline.mean.inputRms; delta = log2(max(0.01, energyRelative)) / log2(1.35); bars = toBars(centeredScore(delta)).",
      clamps: "centeredScore clamps delta to -1.5..1.5 then maps to 0.05..0.95; toBars clamps 0..1 and rounds to 1..5.",
    },
    stability: {
      absolute:
        "No baseline: average of smoothnessScore, sustainStability, melodicSmoothness, and 1 - clamp(amplitudeStability / 0.05, 0, 1), then toBars. If no score exists, amplitude fallback is used.",
      baselineRelative:
        "With baseline: currentStability and baselineStability use the same score; delta = (current - baseline) / 0.22; bars = toBars(centeredScore(delta)). If stability is unavailable, fallback is -instabilityScore.",
      dropoutNote:
        "Pause count is computed from interior null pitch-track segments after closing short unvoiced gaps, so pitch-tracking dropouts can affect pause-related state scores even when quiet percentage is low.",
    },
    movement: {
      absolute:
        "No baseline: bars = toBars(clamp(pitchRange/6 + noteChangeRate/3 + glideScore*0.3, 0, 1)). Raw pitchVariance and pitchStability are not directly used.",
      baselineRelative:
        "With baseline: movementDelta = average([pitchRange z, noteChangeRate z, glideScore z, abs(pitchContourShape z)*0.7]); bars = toBars(centeredScore(movementDelta)).",
      rawValueNote:
        "Pitch variance, pitch steadiness, and jitter can be raw/unbounded in details. Meter movement uses pitchRange/noteChangeRate/glide/contour, while state classification normalizes pitchVariance and jitter through zDelta with feature-specific epsilon floors.",
    },
  };
}

function summarize(values: Array<number | null>) {
  const sorted = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return { min: null, median: null, max: null };
  return {
    min: round(sorted[0]),
    median: round(percentile(sorted, 0.5)),
    max: round(sorted[sorted.length - 1]),
  };
}

function averageNullable(values: Array<number | null>) {
  const finiteValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return finiteValues.length ? round(finiteValues.reduce((total, value) => total + value, 0) / finiteValues.length) : null;
}

function percentile(sortedValues: number[], percentileValue: number) {
  const index = (sortedValues.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? round(value) : null;
}

function percent(value: number | null) {
  return value === null ? null : round(value * 100);
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}

declare global {
  interface Window {
    __HUM_DEBUG__?: {
      auditSessions?: typeof auditSessions;
      getRecordingAttemptDiagnostics?: typeof getRecordingAttemptDiagnostics;
      printMeterFormulas?: typeof printMeterFormulas;
      printBaselineStatus?: typeof printBaselineStatus;
      printThreadInsight?: typeof printThreadInsight;
    };
  }
}
