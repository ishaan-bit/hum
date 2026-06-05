import { assessHumQuality } from "@/lib/quality";
import { getBaseline, getFeatureDeltas, getSignalType } from "@/lib/recommendation";
import { formatSignalTitle, getSignalInterpretation } from "@/lib/signalCopy";
import type { AudioFeatures, BaselineStats, HumSession } from "@/types/hum";

export const HUM_SESSION_STORAGE_SCHEMA = {
  ids: ["id", "sessionId"],
  timestamps: ["createdAt", "checkInAvailableAt"],
  audio: ["audioKey", "audioMimeType"],
  rawAudioQuality: [
    "features.duration",
    "features.inputRms",
    "features.meanRms",
    "features.medianRms",
    "features.activeFrameRatio",
    "features.quietFrameRatio",
    "features.clippedFrameRatio",
    "features.noiseFloorRms",
    "features.peakAmplitude",
    "features.isTooFaint",
    "features.isSilent",
    "quality",
    "captureQuality",
    "captureReasons",
    "stateReasons",
    "shouldEnterBaseline",
    "shouldGenerateRecommendation",
    "confidenceWeight",
  ],
  acousticFeatures: ["features"],
  baselineComparison: ["signal", "signalType"],
  mlReadyData: ["mlData", "metadata", "taskType"],
  classificationResult: ["signal", "signalType"],
  recommendationAction: ["action", "actionId", "pickedFromLearning", "checkInAvailableAt"],
  feedback: ["feedback", "userFeedback", "actionFeedback"],
  consent: ["researchConsent", "audioRetainedForResearch", "featureExportAllowed"],
} as const;

export function buildSessionAudit(session: HumSession, allSessions: HumSession[]) {
  const priorSessions = getPriorSessions(session, allSessions);
  const baselineUsed = getBaseline(priorSessions);
  const qualityDecision = assessHumQuality(session.features, priorSessions);
  const deltas = baselineUsed ? getFeatureDeltas(session.features, baselineUsed) : null;
  const normalizedFeatures = baselineUsed ? normalizeAgainstBaseline(session.features, baselineUsed) : null;
  const finalLabel = session.signal;

  return {
    timestamp: session.createdAt,
    ids: {
      id: session.id,
      sessionId: session.sessionId,
    },
    audio: {
      audioKey: session.audioKey,
      audioMimeType: session.audioMimeType,
    },
    duration: session.features.duration,
    quality: {
      saved: session.quality,
      captureQuality: session.captureQuality ?? qualityDecision.captureQuality,
      accepted: true,
      recomputedDecision: qualityDecision.quality,
      reason: qualityDecision.reason,
      failedGate: qualityDecision.failedGate,
      captureReasons: session.captureReasons ?? qualityDecision.captureReasons,
      stateReasons: session.stateReasons ?? qualityDecision.stateReasons,
      shouldEnterBaseline: session.shouldEnterBaseline ?? qualityDecision.shouldEnterBaseline,
      shouldGenerateRecommendation: session.shouldGenerateRecommendation ?? qualityDecision.shouldGenerateRecommendation,
      confidenceWeight: session.confidenceWeight,
    },
    rawFeatures: session.features,
    mlData: session.mlData,
    metadata: session.metadata,
    taskType: session.taskType,
    normalizedFeatures,
    baselineUsed,
    comparison: {
      deltas,
      zScores: deltas,
    },
    classification: {
      storedLabel: session.signal,
      recomputedType: getSignalType(finalLabel),
      storedType: session.signalType,
      title: formatSignalTitle(finalLabel),
      copy: getSignalInterpretation(finalLabel),
    },
    recommendation: {
      action: session.action,
      actionId: session.actionId,
      pickedFromLearning: session.pickedFromLearning,
      checkInAvailableAt: session.checkInAvailableAt,
    },
    feedback: {
      userFeedback: session.userFeedback,
      actionFeedback: session.actionFeedback,
      legacyFeedback: session.feedback,
    },
    consent: {
      researchConsent: session.researchConsent,
      audioRetainedForResearch: session.audioRetainedForResearch,
      featureExportAllowed: session.featureExportAllowed,
    },
  };
}

function getPriorSessions(session: HumSession, allSessions: HumSession[]) {
  const timestamp = Date.parse(session.createdAt);

  return allSessions.filter((candidate) => {
    if (candidate.sessionId === session.sessionId) return false;
    const candidateTimestamp = Date.parse(candidate.createdAt);
    if (Number.isNaN(timestamp) || Number.isNaN(candidateTimestamp)) {
      return candidate.createdAt < session.createdAt;
    }

    return candidateTimestamp < timestamp;
  });
}

function normalizeAgainstBaseline(features: AudioFeatures, baseline: BaselineStats) {
  return {
    energyRelative: ratio(features.inputRms, baseline.mean.inputRms),
    meanRmsRelative: ratio(features.meanRms, baseline.mean.meanRms),
    medianRmsRelative: ratio(features.medianRms, baseline.mean.medianRms),
    pitchRelative: ratio(features.pitchMean ?? features.pitchHz, baseline.mean.pitchMean ?? baseline.mean.pitchHz),
    pitchVarianceRelative: ratio(features.pitchVariance, baseline.mean.pitchVariance),
    jitterRelative: ratio(features.jitter, baseline.mean.jitter),
    silenceRelative: ratio(features.silenceRatio, baseline.mean.silenceRatio),
    activeFrameRelative: ratio(features.activeFrameRatio, baseline.mean.activeFrameRatio),
    clippedFrameRelative: ratio(features.clippedFrameRatio, baseline.mean.clippedFrameRatio),
  };
}

function ratio(value: number | null, baselineValue: number | null) {
  if (value === null || baselineValue === null || baselineValue === 0) return null;
  return value / baselineValue;
}
