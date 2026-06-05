import type {
  ActionScores,
  AudioFeatures,
  BaselineStats,
  BaselineComparison,
  DimensionScores,
  HumAction,
  HumSession,
  SignalLabel,
  SignalType,
} from "@/types/hum";
import { getBaselineEligibility, isBaselineEligibleSession } from "@/lib/baselineEligibility";
import { getExpressionFilterMetrics } from "@/lib/audioFeatures";
import { isHumDebugEnabled } from "@/lib/humDebug";

export const BASELINE_SESSION_COUNT = 5;
const ROLLING_BASELINE_SESSION_COUNT = 24;
const STRONG_DELTA = 1.25;
export const BASELINE_NEUTRAL_BAND = 0.85;
const NEUTRAL_BAND = BASELINE_NEUTRAL_BAND;
const CLEAR_LABEL_THRESHOLD = 0.34;
const LEARNING_REPEAT_MARGIN = 4;
const RECENT_ACTION_PENALTIES = [-6, -3, -1.5] as const;

const stdDevFeatureKeys = [
  "rmsEnergy",
  "inputRms",
  "meanRms",
  "medianRms",
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
] as const satisfies readonly FeatureKey[];

type FeatureKey =
  | "rmsEnergy"
  | "inputRms"
  | "meanRms"
  | "medianRms"
  | "activeFrameRatio"
  | "quietFrameRatio"
  | "clippedFrameRatio"
  | "noiseFloorRms"
  | "pitchMean"
  | "pitchVariance"
  | "pitchStability"
  | "jitter"
  | "vibratoScore"
  | "glideScore"
  | "amplitudeStability"
  | "breakCount"
  | "avgPauseLength"
  | "pauseCount"
  | "microBreakRatio"
  | "pauseStructureScore"
  | "smoothnessScore"
  | "pitchRange"
  | "noteChangeRate"
  | "melodicSmoothness"
  | "rhythmicStability"
  | "sustainStability"
  | "breathBreakCount"
  | "attackConsistency"
  | "pitchContourShape"
  | "silenceRatio"
  | "zeroCrossingRate"
  | "spectralCentroid"
  | "spectralBandwidth"
  | "spectralRolloff"
  | "spectralFlux"
  | "spectralFlatness"
  | "shimmerProxy"
  | "hnrProxy"
  | "signalToNoiseProxy"
  | "clarityScore"
  | "vibratoRate"
  | "vibratoDepth"
  | "vibratoRegularity"
  | "tremorProxy"
  | "pitchCoverage"
  | "onsetDelay"
  | "longestStableSegment"
  | "breathinessProxy"
  | "musicalityScore"
  | "controlledExpressionScore"
  | "residualPitchInstability"
  | "residualAmplitudeInstability"
  | "residualInstabilityScore"
  | "stableSegmentCoverage"
  | "voicingContinuityCoverage"
  | "pitchStableSegmentCoverage"
  | "phraseContinuityCoverage"
  | "notePlateauScore"
  | "stepwiseMelodicScore"
  | "repeatedPitchRegionScore"
  | "phraseContourScore"
  | "pitchDrift";

type NumericFeatureKey = {
  [Key in keyof AudioFeatures]-?: Exclude<AudioFeatures[Key], undefined> extends number | null ? Key : never;
}[keyof AudioFeatures] extends infer Key
  ? Exclude<Key, "loudness">
  : never;

type FeatureDeltas = Record<
  | "energy"
  | "pitchMean"
  | "pitchVariance"
  | "pitchStability"
  | "jitter"
  | "vibratoScore"
  | "glideScore"
  | "pauseStructureScore"
  | "variableJitter"
  | "variablePitchVariance"
  | "variableSmoothness"
  | "instabilityScore"
  | "energyRelative"
  | "pitchRelative"
  | "variationRelative"
  | "amplitudeStability"
  | "breakCount"
  | "avgPauseLength"
  | "pauseCount"
  | "microBreakRatio"
  | "smoothnessScore"
  | "pitchRange"
  | "noteChangeRate"
  | "melodicSmoothness"
  | "rhythmicStability"
  | "sustainStability"
  | "breathBreaks"
  | "attackConsistency"
  | "pitchContourShape"
  | "silence"
  | "zeroCrossing"
  | "spectralCentroid"
  | "absolutePitchDrift"
  | "residualPitchInstability"
  | "residualAmplitudeInstability"
  | "residualInstabilityScore",
  number
>;

const actions: HumAction[] = [
  {
    id: "sunlight-walk",
    type: "low-energy",
    title: "Sunlight lap",
    description: "Take a slow ten-minute walk outside, even if it is just around the block.",
  },
  {
    id: "water-reset",
    type: "low-energy",
    title: "Water reset",
    description: "Drink a glass of water, then do one tiny movement that feels easy.",
  },
  {
    id: "box-breathing",
    type: "scattered",
    title: "Four quiet breaths",
    description: "Breathe in for four, pause for four, out for four. Repeat four times.",
  },
  {
    id: "soft-stretch",
    type: "scattered",
    title: "Shoulder unspool",
    description: "Roll your shoulders, stretch your neck, and let the next minute be slower.",
  },
  {
    id: "voice-note",
    type: "steady",
    title: "Send a tiny spark",
    description: "Send one kind voice note or make a small creative mark before the day speeds up.",
  },
  {
    id: "sketch-line",
    type: "steady",
    title: "One-line sketch",
    description: "Draw or write one line about the day. Keep it small enough to finish.",
  },
];

const lowPressureActionIds = new Set(["water-reset", "box-breathing", "soft-stretch", "sketch-line"]);

export function getBaseline(sessions: HumSession[]): BaselineStats | null {
  const baselineSessions = [...sessions]
    .filter(isCompletedBaselineSession)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  debugBaselineSessions(sessions, baselineSessions);

  if (baselineSessions.length < BASELINE_SESSION_COUNT) return null;
  const rollingSessions = baselineSessions.slice(-ROLLING_BASELINE_SESSION_COUNT);
  const features = rollingSessions.map((session) => session.features);
  const weights = rollingSessions.map((session) => session.confidenceWeight ?? 1);
  const robust = robustFeatureStats(features);

  return {
    count: rollingSessions.length,
    version: 2,
    validBaselineCount: baselineSessions.length,
    sourceSessionIds: rollingSessions.map((session) => session.sessionId),
    mean: averageFeatures(features, weights, robust.median, robust.mad),
    stdDev: standardDeviationFeatures(features, weights, robust.mad),
    median: robust.median,
    mad: robust.mad,
    iqr: robust.iqr,
  };
}

export function compareToBaseline(
  features: AudioFeatures,
  baseline: BaselineStats | null,
): SignalLabel | null {
  return analyzeHumState(features, baseline).label;
}

export function analyzeHumState(
  features: AudioFeatures,
  baseline: BaselineStats | null,
): {
  label: SignalLabel | null;
  labelConfidence: number | null;
  dimensionScores: DimensionScores | null;
  baselineComparison: BaselineComparison | null;
} {
  if (!baseline) {
    return {
      label: null,
      labelConfidence: null,
      dimensionScores: null,
      baselineComparison: null,
    };
  }

  const deltas = getFeatureDeltas(features, baseline);
  const zScores = getComparisonZScores(features, baseline);
  const ratios = getComparisonRatios(features, baseline);
  const dimensionScores = getDimensionScores(features, baseline, deltas);
  const ranked = rankDimensionLabels(dimensionScores);
  const [best, second] = ranked;
  const distance = dimensionScores.baselineDistanceScore;
  const label =
    distance < NEUTRAL_BAND ||
    !best ||
    best.score < CLEAR_LABEL_THRESHOLD ||
    (second && best.score - second.score < 0.12)
      ? "Close to your usual pattern"
      : best.label;
  const labelConfidence =
    label === "Close to your usual pattern"
      ? clamp(1 - distance / 2.8, 0.48, 0.86)
      : clamp(best.score + Math.max(0, best.score - (second?.score ?? 0)) * 0.4, 0.52, 0.94);
  const unsortedScores = [
    deliveryPattern({
      label: "More activated than usual",
      signals: [
        signal(relativeDelta(deltas.energyRelative), "higher energy than usual", 0.34),
        signal(-deltas.silence, "less quiet space", 0.28),
        signal(deltas.amplitudeStability, "less regular energy transitions", 0.26),
        signal(deltas.attackConsistency, "stronger attack consistency", 0.22),
      ],
    }),
    deliveryPattern({
      label: "More subdued than usual",
      signals: [
        signal(deltas.silence, "more quiet space", 0.34),
        signal(deltas.breakCount, "more silent breaks", 0.3),
        signal(deltas.avgPauseLength, "longer pauses", 0.22),
        signal(relativeDelta(1 / Math.max(0.01, deltas.energyRelative)), "lower energy than usual", 0.3),
      ],
    }),
    deliveryPattern({
      label: "More variable than usual",
      signals: [
        signal(deltas.residualPitchInstability, "irregular pitch scatter after musical filtering", 0.28),
        signal(deltas.residualAmplitudeInstability, "random volume shimmer after envelope filtering", 0.22),
        signal(deltas.residualInstabilityScore, "higher residual instability after expression filtering", 0.38),
        signal(deltas.microBreakRatio, "more tiny breaks", 0.22),
        signal(-deltas.variableSmoothness, "less smooth irregular contour", 0.18),
      ],
    }),
    deliveryPattern({
      label: "Flatter than usual",
      signals: [
        signal(-deltas.pitchRange, "narrower melody range", 0.34),
        signal(-deltas.pitchVariance, "lower pitch variance", 0.32),
        signal(-deltas.noteChangeRate, "fewer note changes", 0.22),
      ],
    }),
    deliveryPattern({
      label: "Steadier than usual",
      signals: [
        signal(-deltas.jitter, "lower pitch jitter", 0.34),
        signal(-deltas.pitchStability, "lower frame pitch change", 0.3),
        signal(deltas.smoothnessScore, "smoother contour", 0.28),
        signal(deltas.sustainStability, "steadier sustains", 0.2),
      ],
    }),
  ];
  const scores = [...unsortedScores].sort(
    (left, right) => right.strongFeatureCount - left.strongFeatureCount || right.score - left.score,
  );

  debugSignalDecision(label, features, deltas, scores);
  return {
    label,
    labelConfidence,
    dimensionScores,
    baselineComparison: {
      baselineVersion: 2,
      baselineCount: baseline.validBaselineCount,
      zScores,
      ratios,
    },
  };
}

export function getBaselineProgress(sessions: HumSession[]) {
  return Math.min(sessions.filter(isCompletedBaselineSession).length, BASELINE_SESSION_COUNT);
}

export function getSignalType(signal: SignalLabel | null): SignalType | null {
  if (signal === "More activated than usual") return "activated";
  if (signal === "More subdued than usual") return "flat";
  if (signal === "Flatter than usual") return "flat";
  if (signal === "Less clear than usual") return "scattered";
  if (signal === "More variable than usual") return "scattered";
  if (signal === "Steadier than usual") return "steady";
  if (signal === "Close to your usual pattern") return "close";
  return null;
}

export function getIndicatorLevels(features: AudioFeatures, baseline: BaselineStats | null) {
  if (!baseline) {
    return {
      stability: rawStabilityLevel(features),
      energy: toBars(clamp(features.inputRms / 0.06, 0, 1)),
      movement: rawMovementLevel(features),
    };
  }

  const deltas = getFeatureDeltas(features, baseline);
  const currentStability = getStabilityScore(features);
  const baselineStability = getStabilityScore(baseline.mean);
  const stabilityDelta =
    currentStability !== null && baselineStability !== null
      ? (currentStability - baselineStability) / 0.22
      : -deltas.instabilityScore;
  const movementDelta = average([
    deltas.pitchRange,
    deltas.noteChangeRate,
    deltas.glideScore,
    Math.abs(deltas.pitchContourShape) * 0.7,
  ]);

  return {
    stability: toBars(centeredScore(stabilityDelta)),
    energy: toBars(centeredScore(relativeDelta(deltas.energyRelative))),
    movement: toBars(centeredScore(movementDelta)),
  };
}

export type IndicatorFormulaAudit = {
  mode: "absolute" | "baseline-relative";
  bars: {
    stability: number;
    energy: number;
    movement: number;
  };
  formulas: {
    stability: Record<string, number | null | string>;
    energy: Record<string, number | null | string>;
    movement: Record<string, number | null | string>;
  };
};

export function getIndicatorFormulaAudit(features: AudioFeatures, baseline: BaselineStats | null): IndicatorFormulaAudit {
  if (!baseline) {
    const stabilityScore = getStabilityScore(features);
    const fallbackStability = 1 - clamp(features.amplitudeStability / 0.05, 0, 1);
    const energyRaw = clamp(features.inputRms / 0.06, 0, 1);
    const movementRaw = clamp(
      (features.pitchRange ?? 0) / 6 + (features.noteChangeRate ?? 0) / 3 + (features.glideScore ?? 0) * 0.3,
      0,
      1,
    );

    return {
      mode: "absolute",
      bars: {
        stability: toBars(stabilityScore ?? fallbackStability),
        energy: toBars(energyRaw),
        movement: toBars(movementRaw),
      },
      formulas: {
        stability: {
          inputs: "smoothnessScore, sustainStability, melodicSmoothness, amplitudeStability",
          smoothnessScore: features.smoothnessScore,
          sustainStability: features.sustainStability,
          melodicSmoothness: features.melodicSmoothness,
          amplitudePenalty: features.amplitudeStability,
          rawScore: stabilityScore ?? fallbackStability,
          clamp: "0..1",
          bars: "round(clamp(rawScore, 0, 1) * 5), clamped to 1..5",
        },
        energy: {
          inputs: "inputRms only",
          inputRms: features.inputRms,
          peakAmplitude: features.peakAmplitude,
          meanRms: features.meanRms,
          rawScore: energyRaw,
          formula: "clamp(inputRms / 0.06, 0, 1)",
          bars: "round(rawScore * 5), clamped to 1..5",
        },
        movement: {
          inputs: "pitchRange, noteChangeRate, glideScore",
          pitchRange: features.pitchRange,
          noteChangeRate: features.noteChangeRate,
          glideScore: features.glideScore,
          rawScore: movementRaw,
          formula: "clamp(pitchRange/6 + noteChangeRate/3 + glideScore*0.3, 0, 1)",
          bars: "round(rawScore * 5), clamped to 1..5",
        },
      },
    };
  }

  const deltas = getFeatureDeltas(features, baseline);
  const currentStability = getStabilityScore(features);
  const baselineStability = getStabilityScore(baseline.mean);
  const stabilityDelta =
    currentStability !== null && baselineStability !== null
      ? (currentStability - baselineStability) / 0.22
      : -deltas.instabilityScore;
  const energyDelta = relativeDelta(deltas.energyRelative);
  const movementDelta = average([
    deltas.pitchRange,
    deltas.noteChangeRate,
    deltas.glideScore,
    Math.abs(deltas.pitchContourShape) * 0.7,
  ]);

  return {
    mode: "baseline-relative",
    bars: {
      stability: toBars(centeredScore(stabilityDelta)),
      energy: toBars(centeredScore(energyDelta)),
      movement: toBars(centeredScore(movementDelta)),
    },
    formulas: {
      stability: {
        inputs: "current stability score vs baseline stability score; fallback negative instabilityScore",
        currentStability,
        baselineStability,
        stabilityDelta,
        instabilityScore: deltas.instabilityScore,
        rawScore: centeredScore(stabilityDelta),
        formula: "centeredScore((currentStability - baselineStability) / 0.22)",
        centeredScore: "clamp(0.5 + clamp(delta, -1.5, 1.5) / 3, 0.05, 0.95)",
      },
      energy: {
        inputs: "inputRms relative to baseline inputRms",
        inputRms: features.inputRms,
        baselineInputRms: baseline.mean.inputRms,
        energyRelative: deltas.energyRelative,
        energyDelta,
        peakAmplitude: features.peakAmplitude,
        meanRms: features.meanRms,
        rawScore: centeredScore(energyDelta),
        formula: "centeredScore(log2(max(0.01, inputRms / baseline.inputRms)) / log2(1.35))",
      },
      movement: {
        inputs: "baseline-normalized z deltas for pitchRange, noteChangeRate, glideScore, pitchContourShape",
        pitchRangeDelta: deltas.pitchRange,
        noteChangeRateDelta: deltas.noteChangeRate,
        glideScoreDelta: deltas.glideScore,
        pitchContourShapeDelta: deltas.pitchContourShape,
        pitchVariance: features.pitchVariance,
        pitchStability: features.pitchStability,
        movementDelta,
        rawScore: centeredScore(movementDelta),
        formula: "centeredScore(average([pitchRange z, noteChangeRate z, glideScore z, abs(pitchContourShape z)*0.7]))",
      },
    },
  };
}

export function getFeatureDeltas(features: AudioFeatures, baseline: BaselineStats): FeatureDeltas {
  const expression = getExpressionFilterMetrics(features);
  return {
    energy: zDelta("inputRms", features.inputRms, baseline),
    pitchMean: zDelta("pitchMean", features.pitchMean, baseline),
    pitchVariance: zDelta("pitchVariance", features.pitchVariance, baseline),
    pitchStability: zDelta("pitchStability", features.pitchStability, baseline),
    jitter: zDelta("jitter", features.jitter, baseline),
    vibratoScore: zDelta("vibratoScore", features.vibratoScore, baseline),
    glideScore: zDelta("glideScore", features.glideScore, baseline),
    pauseStructureScore: zDelta("pauseStructureScore", features.pauseStructureScore, baseline),
    variableJitter: getStructuredAdjustedDelta(zDelta("jitter", features.jitter, baseline), features, baseline),
    variablePitchVariance: getStructuredAdjustedDelta(
      zDelta("pitchVariance", features.pitchVariance, baseline),
      features,
      baseline,
    ),
    variableSmoothness: getStructuredAdjustedSmoothnessDelta(
      zDelta("smoothnessScore", features.smoothnessScore, baseline),
      features,
      baseline,
    ),
    instabilityScore: getInstabilityScore(features, baseline),
    energyRelative: relativeRatio(features.inputRms, baseline.mean.inputRms),
    pitchRelative: pitchRelative(features, baseline),
    variationRelative: relativeRatio(features.pitchVariance, baseline.mean.pitchVariance),
    amplitudeStability: zDelta("amplitudeStability", features.amplitudeStability, baseline),
    breakCount: zDelta("breakCount", features.breakCount, baseline),
    avgPauseLength: zDelta("avgPauseLength", features.avgPauseLength, baseline),
    pauseCount: zDelta("pauseCount", features.pauseCount, baseline),
    microBreakRatio: zDelta("microBreakRatio", features.microBreakRatio, baseline),
    smoothnessScore: zDelta("smoothnessScore", features.smoothnessScore, baseline),
    pitchRange: zDelta("pitchRange", features.pitchRange, baseline),
    noteChangeRate: zDelta("noteChangeRate", features.noteChangeRate, baseline),
    melodicSmoothness: zDelta("melodicSmoothness", features.melodicSmoothness, baseline),
    rhythmicStability: zDelta("rhythmicStability", features.rhythmicStability, baseline),
    sustainStability: zDelta("sustainStability", features.sustainStability, baseline),
    breathBreaks: zDelta("breathBreakCount", features.breathBreakCount, baseline),
    attackConsistency: zDelta("attackConsistency", features.attackConsistency, baseline),
    pitchContourShape: zDelta("pitchContourShape", features.pitchContourShape, baseline),
    silence: zDelta("silenceRatio", features.silenceRatio, baseline),
    zeroCrossing: zDelta("zeroCrossingRate", features.zeroCrossingRate, baseline),
    spectralCentroid: zDelta("spectralCentroid", features.spectralCentroid, baseline),
    absolutePitchDrift: zDelta(
      "pitchDrift",
      features.pitchDrift === null ? null : Math.abs(features.pitchDrift),
      baseline,
      (value) => Math.abs(value),
    ),
    residualPitchInstability: getResidualDelta("residualPitchInstability", expression.residualPitchInstability, baseline),
    residualAmplitudeInstability: getResidualDelta(
      "residualAmplitudeInstability",
      expression.residualAmplitudeInstability,
      baseline,
    ),
    residualInstabilityScore: getResidualDelta("residualInstabilityScore", expression.residualInstabilityScore, baseline),
  };
}

function getDimensionScores(
  features: AudioFeatures,
  baseline: BaselineStats,
  deltas: FeatureDeltas,
): DimensionScores {
  const activationScore = signedAverage([
    relativeDelta(deltas.energyRelative),
    -deltas.silence * 0.7,
    zDelta("activeFrameRatio", features.activeFrameRatio, baseline) * 0.45,
  ]);
  const variableComponents = [
    deltas.residualPitchInstability,
    deltas.residualAmplitudeInstability,
    deltas.residualInstabilityScore,
    deltas.microBreakRatio,
  ];
  const steadyComponents = [
    -deltas.jitter,
    -deltas.pitchStability,
    deltas.smoothnessScore,
    deltas.sustainStability,
    zDelta("longestStableSegment", features.longestStableSegment, baseline) * 0.6,
  ];
  const clarityDelta = signedAverage([
    zDelta("clarityScore", features.clarityScore, baseline),
    zDelta("pitchCoverage", features.pitchCoverage, baseline) * 0.7,
    -zDelta("breathinessProxy", features.breathinessProxy, baseline) * 0.6,
    -zDelta("spectralFlatness", features.spectralFlatness, baseline) * 0.35,
  ]);
  const smoothnessDelta = signedAverage([
    deltas.smoothnessScore,
    deltas.melodicSmoothness,
    -deltas.absolutePitchDrift * 0.45,
    -zDelta("spectralFlux", features.spectralFlux, baseline) * 0.35,
  ]);
  const continuityDelta = signedAverage([
    -deltas.breakCount,
    -deltas.pauseCount,
    -deltas.avgPauseLength,
    -zDelta("onsetDelay", features.onsetDelay, baseline) * 0.45,
    zDelta("pitchCoverage", features.pitchCoverage, baseline) * 0.5,
  ]);
  const controlDelta = signedAverage([
    -deltas.residualPitchInstability,
    -deltas.residualAmplitudeInstability,
    deltas.attackConsistency,
    zDelta("vibratoRegularity", features.vibratoRegularity, baseline) * 0.4,
  ]);
  const distanceValues = [
    activationScore,
    clarityDelta,
    smoothnessDelta,
    continuityDelta,
    controlDelta,
    ...variableComponents,
    ...steadyComponents,
  ].map((value) => Math.abs(value));

  return {
    activationScore: roundScore(activationScore),
    stabilityScore: roundScore(signedAverage([...steadyComponents, ...variableComponents.map((value) => -value)])),
    clarityScore: roundScore(clarityDelta),
    smoothnessScore: roundScore(smoothnessDelta),
    continuityScore: roundScore(continuityDelta),
    controlScore: roundScore(controlDelta),
    baselineDistanceScore: roundScore(distanceValues.length ? average(distanceValues) : 0),
  };
}

function rankDimensionLabels(scores: DimensionScores) {
  return [
    { label: "More activated than usual" as SignalLabel, score: positiveScore(scores.activationScore) },
    { label: "More subdued than usual" as SignalLabel, score: positiveScore(-scores.activationScore) },
    { label: "Steadier than usual" as SignalLabel, score: positiveScore(scores.stabilityScore + scores.controlScore * 0.25) },
    { label: "More variable than usual" as SignalLabel, score: positiveScore(-scores.stabilityScore + -scores.controlScore * 0.2) },
    { label: "Flatter than usual" as SignalLabel, score: positiveScore(-scores.smoothnessScore * 0.8 + -scores.activationScore * 0.2) },
    { label: "Less clear than usual" as SignalLabel, score: positiveScore(-scores.clarityScore) },
  ].sort((left, right) => right.score - left.score);
}

function getComparisonZScores(features: AudioFeatures, baseline: BaselineStats) {
  const zScores: BaselineComparison["zScores"] = {};
  for (const key of stdDevFeatureKeys) {
    zScores[key] = roundScore(zDelta(key, getNumericFeatureValue(features, key), baseline));
  }

  return zScores;
}

function getComparisonRatios(features: AudioFeatures, baseline: BaselineStats) {
  const ratios: BaselineComparison["ratios"] = {};
  for (const key of stdDevFeatureKeys) {
    const current = getNumericFeatureValue(features, key);
    const usual = baseline.mean[key];
    if (typeof current === "number" && typeof usual === "number" && usual > 0) {
      ratios[key] = roundScore(current / usual);
    }
  }

  return ratios;
}

function positiveScore(value: number) {
  return Math.max(0, (Math.abs(value) < NEUTRAL_BAND ? 0 : value - NEUTRAL_BAND) / 2.2);
}

function relativeRatio(value: number | null, baselineValue: number | null) {
  if (value === null || baselineValue === null || baselineValue <= 0) return 1;
  return value / baselineValue;
}

function pitchRelative(features: AudioFeatures, baseline: BaselineStats) {
  const currentPitch = features.pitchMean ?? features.pitchHz;
  const baselinePitch = baseline.mean.pitchMean ?? baseline.mean.pitchHz;
  if (currentPitch === null || baselinePitch === null) return 0;

  const pitchStd = Math.sqrt(Math.max(baseline.mean.pitchVariance ?? 0, 0));
  const denominator = Math.max(pitchStd, epsilonForFeature("pitchMean"));
  return (currentPitch - baselinePitch) / denominator;
}

function relativeDelta(ratio: number) {
  return Math.log2(Math.max(0.01, ratio)) / Math.log2(1.35);
}

function getInstabilityScore(features: AudioFeatures, baseline: BaselineStats) {
  const expression = getExpressionFilterMetrics(features);
  const cleanContinuous =
    expression.stableSegmentCoverage > 0.8 &&
    (features.pitchCoverage ?? 0) > 0.85 &&
    features.activeFrameRatio > 0.75 &&
    features.breakCount === 0 &&
    features.pauseCount === 0;
  const components = [
    getResidualDelta("residualPitchInstability", expression.residualPitchInstability, baseline),
    getResidualDelta("residualAmplitudeInstability", expression.residualAmplitudeInstability, baseline),
    zDelta("breakCount", features.breakCount, baseline),
    zDelta("pauseCount", features.pauseCount, baseline),
    zDelta("microBreakRatio", features.microBreakRatio, baseline),
    -zDelta("rhythmicStability", features.rhythmicStability, baseline),
  ]
    .map((value) => Math.max(0, value))
    .filter((value) => value > 0);

  if (!components.length) return 0;
  const continuitySuppression = cleanContinuous && expression.residualInstabilityScore < 0.7 ? 0.45 : 1;
  const expressionSuppression = clamp(1 - Math.max(expression.musicalityScore, expression.controlledExpressionScore) * 0.45, 0.35, 1);
  return average(components) * expressionSuppression * continuitySuppression;
}

function getResidualDelta(key: FeatureKey, currentValue: number, baseline: BaselineStats) {
  const baselineValue = getNumericFeatureValue(baseline.mean, key as NumericFeatureKey);
  if (typeof baselineValue !== "number") return (currentValue - 0.45) / 0.22;
  return zDelta(key, currentValue, baseline);
}

function signal(delta: number, label: string, weight: number) {
  return { delta, label, weight };
}

function deliveryPattern({
  label,
  signals,
}: {
  label: SignalLabel;
  signals: Array<{ delta: number; label: string; weight: number }>;
}) {
  const strongSignals = signals.filter((entry) => entry.delta >= STRONG_DELTA);

  return {
    label,
    score: signals.reduce((total, entry) => total + contribution(entry.delta, STRONG_DELTA, entry.weight), 0),
    reasons: strongSignals.map((entry) => entry.label),
    strongFeatureCount: strongSignals.length,
  };
}

function contribution(delta: number, threshold: number, weight: number) {
  if (delta <= 0) return 0;
  return Math.min(delta / threshold, 1.4) * weight;
}

function debugSignalDecision(
  label: SignalLabel,
  features: AudioFeatures,
  deltas: FeatureDeltas,
  scores: Array<{ label: SignalLabel; score: number; reasons: string[]; strongFeatureCount: number }>,
) {
  if (!isHumDebugEnabled()) return;

  const winner = scores[0];
  console.info("[Hum signal]", {
    label,
    musicalFeatures: {
      pitchRange: features.pitchRange,
      jitter: features.jitter,
      vibratoScore: features.vibratoScore,
      glideScore: features.glideScore,
      pitchStability: features.pitchStability,
      amplitudeStability: features.amplitudeStability,
      breakCount: features.breakCount,
      avgPauseLength: features.avgPauseLength,
      pauseCount: features.pauseCount,
      microBreakRatio: features.microBreakRatio,
      pauseStructureScore: features.pauseStructureScore,
      smoothnessScore: features.smoothnessScore,
      noteChangeRate: features.noteChangeRate,
      melodicSmoothness: features.melodicSmoothness,
      rhythmicStability: features.rhythmicStability,
      sustainStability: features.sustainStability,
      breathBreakCount: features.breathBreakCount,
      attackConsistency: features.attackConsistency,
      pitchContourShape: features.pitchContourShape,
    },
    zScoreDeltas: deltas,
    scores: scores.map((score) => ({
      label: score.label,
      score: Number(score.score.toFixed(2)),
      strongFeatureCount: score.strongFeatureCount,
      reasons: score.reasons,
    })),
    reason: {
      summary:
        label === "Close to your usual pattern"
          ? "No delivery pattern had two or more related features strongly agreeing."
          : winner.reasons.join(", ") || "Related delivery features strongly agreed.",
      reasonFeatures: label === "Close to your usual pattern" ? [] : winner.reasons,
    },
  });
}

export function recommendAction(
  features: AudioFeatures,
  signalType: SignalType | null,
  scores: ActionScores,
  sessions: HumSession[],
): { action: HumAction; pickedFromLearning: boolean } {
  const type =
    signalType === "scattered" || features.zeroCrossingRate > 0.16
      ? "scattered"
      : signalType === "flat"
        ? "low-energy"
        : signalType === "steady" || signalType === "close"
          ? "steady"
          : features.rmsEnergy < 0.045
            ? "low-energy"
            : "steady";

  const candidates =
    signalType === "close"
      ? actions.filter((action) => lowPressureActionIds.has(action.id))
      : actions.filter((action) => action.type === type);
  const recentActionIds = sessions.slice(0, RECENT_ACTION_PENALTIES.length).map((session) => session.actionId);
  const scoresForSignal = signalType ? scores[signalType] : undefined;
  const offset = sessions.length % candidates.length;
  const rotatedCandidates = [...candidates.slice(offset), ...candidates.slice(0, offset)];
  const scored = rotatedCandidates
    .map((action) => {
      const recentIndex = recentActionIds.indexOf(action.id);
      const learningScore = scoresForSignal?.[action.id] ?? 0;
      const recentPenalty = recentIndex >= 0 ? RECENT_ACTION_PENALTIES[recentIndex] : 0;
      const explorationBonus = recentIndex === -1 ? 1 : 0;
      const triedForSignal = signalType
        ? sessions.some((session) => session.signalType === signalType && session.actionId === action.id)
        : sessions.some((session) => session.actionId === action.id);
      const untriedBonus = triedForSignal ? 0 : 0.5;

      return {
        action,
        learningScore,
        score: learningScore + recentPenalty + explorationBonus + untriedBonus,
        scoreWithoutLearning: recentPenalty + explorationBonus + untriedBonus,
      };
    })
    .sort((left, right) => right.score - left.score);

  let [winner] = scored;
  const runnerUp = scored.find((entry) => entry.action.id !== winner.action.id);
  const lastActionId = recentActionIds[0];
  if (
    winner.action.id === lastActionId &&
    runnerUp &&
    (winner.learningScore < LEARNING_REPEAT_MARGIN ||
      winner.learningScore - runnerUp.learningScore < LEARNING_REPEAT_MARGIN)
  ) {
    winner = runnerUp;
  }

  const noLearningWinner = [...scored].sort(
    (left, right) => right.scoreWithoutLearning - left.scoreWithoutLearning,
  )[0];
  const pickedFromLearning =
    Boolean(winner.learningScore > 0 && winner.action.id !== noLearningWinner.action.id) ||
    Boolean(winner.action.id === lastActionId && winner.learningScore >= LEARNING_REPEAT_MARGIN);

  return { action: winner.action, pickedFromLearning };
}

function averageFeatures(
  features: AudioFeatures[],
  weights: number[] = features.map(() => 1),
  medianValues: Partial<Record<keyof AudioFeatures, number | null>> = {},
  madValues: Partial<Record<keyof AudioFeatures, number | null>> = {},
): AudioFeatures {
  const weighted = (key: keyof AudioFeatures) =>
    robustWeightedAverage(
      features.map((feature) => getNumericFeatureValue(feature, key as NumericFeatureKey)),
      weights,
      medianValues[key] ?? null,
      madValues[key] ?? null,
    );
  const nullableWeighted = (key: keyof AudioFeatures) =>
    robustNullableWeightedAverage(
      features.map((feature) => getNumericFeatureValue(feature, key as NumericFeatureKey)),
      weights,
      medianValues[key] ?? null,
      madValues[key] ?? null,
    );

  return {
    duration: weighted("duration") ?? 0,
    rmsEnergy: weighted("rmsEnergy") ?? 0,
    silenceRatio: weighted("silenceRatio") ?? 0,
    zeroCrossingRate: weighted("zeroCrossingRate") ?? 0,
    spectralCentroid: nullableWeighted("spectralCentroid"),
    spectralBandwidth: nullableWeighted("spectralBandwidth"),
    spectralRolloff: nullableWeighted("spectralRolloff"),
    spectralFlux: nullableWeighted("spectralFlux"),
    spectralFlatness: nullableWeighted("spectralFlatness"),
    pitchMean: nullableWeighted("pitchMean"),
    pitchHz: nullableWeighted("pitchMean"),
    pitchVariance: nullableWeighted("pitchVariance"),
    pitchStability: nullableWeighted("pitchStability"),
    jitter: nullableWeighted("jitter"),
    shimmerProxy: nullableWeighted("shimmerProxy"),
    hnrProxy: nullableWeighted("hnrProxy"),
    signalToNoiseProxy: nullableWeighted("signalToNoiseProxy"),
    clarityScore: nullableWeighted("clarityScore"),
    vibratoScore: nullableWeighted("vibratoScore"),
    vibratoRate: nullableWeighted("vibratoRate"),
    vibratoDepth: nullableWeighted("vibratoDepth"),
    vibratoRegularity: nullableWeighted("vibratoRegularity"),
    tremorProxy: nullableWeighted("tremorProxy"),
    glideScore: nullableWeighted("glideScore"),
    amplitudeStability: weighted("amplitudeStability") ?? 0,
    breakCount: weighted("breakCount") ?? 0,
    avgPauseLength: weighted("avgPauseLength") ?? 0,
    pauseCount: weighted("pauseCount") ?? 0,
    microBreakRatio: weighted("microBreakRatio") ?? 0,
    pauseStructureScore: nullableWeighted("pauseStructureScore"),
    smoothnessScore: nullableWeighted("smoothnessScore"),
    pitchDrift: nullableWeighted("pitchDrift"),
    pitchRange: nullableWeighted("pitchRange"),
    noteChangeRate: nullableWeighted("noteChangeRate"),
    melodicSmoothness: nullableWeighted("melodicSmoothness"),
    rhythmicStability: nullableWeighted("rhythmicStability"),
    sustainStability: nullableWeighted("sustainStability"),
    breathBreakCount: weighted("breathBreakCount") ?? 0,
    attackConsistency: nullableWeighted("attackConsistency"),
    pitchContourShape: nullableWeighted("pitchContourShape"),
    pitchCoverage: nullableWeighted("pitchCoverage"),
    onsetDelay: nullableWeighted("onsetDelay"),
    longestStableSegment: nullableWeighted("longestStableSegment"),
    breathinessProxy: nullableWeighted("breathinessProxy"),
    musicalityScore: nullableWeighted("musicalityScore"),
    controlledExpressionScore: nullableWeighted("controlledExpressionScore"),
    residualPitchInstability: nullableWeighted("residualPitchInstability"),
    residualAmplitudeInstability: nullableWeighted("residualAmplitudeInstability"),
    residualInstabilityScore: nullableWeighted("residualInstabilityScore"),
    stableSegmentCoverage: nullableWeighted("stableSegmentCoverage"),
    voicingContinuityCoverage: nullableWeighted("voicingContinuityCoverage"),
    pitchStableSegmentCoverage: nullableWeighted("pitchStableSegmentCoverage"),
    phraseContinuityCoverage: nullableWeighted("phraseContinuityCoverage"),
    notePlateauScore: nullableWeighted("notePlateauScore"),
    stepwiseMelodicScore: nullableWeighted("stepwiseMelodicScore"),
    repeatedPitchRegionScore: nullableWeighted("repeatedPitchRegionScore"),
    phraseContourScore: nullableWeighted("phraseContourScore"),
    inputRms: weighted("inputRms") ?? 0,
    meanRms: weighted("meanRms") ?? 0,
    medianRms: weighted("medianRms") ?? 0,
    activeFrameRatio: weighted("activeFrameRatio") ?? 0,
    quietFrameRatio: weighted("quietFrameRatio") ?? 0,
    clippedFrameRatio: weighted("clippedFrameRatio") ?? 0,
    noiseFloorRms: weighted("noiseFloorRms") ?? 0,
    peakAmplitude: weighted("peakAmplitude") ?? 0,
    isTooFaint: features.some((feature) => feature.isTooFaint),
    isSilent: features.every((feature) => feature.isSilent),
  };
}

function getNumericFeatureValue(features: AudioFeatures, key: NumericFeatureKey): number | null {
  if (key === "pitchMean" || key === "pitchHz") return features.pitchMean ?? features.pitchHz;
  if (
    key === "musicalityScore" ||
    key === "controlledExpressionScore" ||
    key === "residualPitchInstability" ||
    key === "residualAmplitudeInstability" ||
    key === "residualInstabilityScore" ||
    key === "stableSegmentCoverage" ||
    key === "voicingContinuityCoverage" ||
    key === "pitchStableSegmentCoverage" ||
    key === "phraseContinuityCoverage"
  ) {
    return features[key] ?? getExpressionFilterMetrics(features)[key];
  }
  return features[key] ?? null;
}

function standardDeviationFeatures(
  features: AudioFeatures[],
  weights: number[] = features.map(() => 1),
  madValues: Partial<Record<keyof AudioFeatures, number | null>> = {},
): BaselineStats["stdDev"] {
  const stdDev: BaselineStats["stdDev"] = {};
  for (const key of stdDevFeatureKeys) {
    const robustStd = typeof madValues[key] === "number" ? (madValues[key] ?? 0) * 1.4826 : null;
    const values = features.map((feature) => getNumericFeatureValue(feature, key));
    const weightedStd = nullableWeightedStandardDeviation(values, weights);
    stdDev[key] = Math.max(weightedStd ?? 0, robustStd ?? 0);
  }

  return stdDev;
}

export function isCompletedBaselineSession(session: HumSession) {
  return isBaselineEligibleSession(session);
}

function debugBaselineSessions(sessions: HumSession[], baselineSessions: HumSession[]) {
  if (!isHumDebugEnabled()) return;

  console.info("[Hum baseline]", {
    totalHumRecordsFound: sessions.length,
    validBaselineEligibleHumsFound: baselineSessions.length,
    rejectedHumsCount: sessions.length - baselineSessions.length,
    baselineReady: baselineSessions.length >= BASELINE_SESSION_COUNT,
    excluded: sessions
      .filter((session) => !baselineSessions.includes(session))
      .map((session) => ({
        id: session.sessionId,
        createdAt: session.createdAt,
        quality: session.quality,
        qualityDecision: session.qualityDecision?.decision ?? null,
        reason: getBaselineEligibility(session).reason,
      })),
  });
}

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function signedAverage(values: number[]) {
  const meaningful = values.filter((value) => Number.isFinite(value));
  return meaningful.length ? average(meaningful) : 0;
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

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}

function weightedAverage(values: number[], weights: number[]) {
  const totalWeight = weights.reduce((total, weight) => total + Math.max(0.1, weight), 0);
  if (totalWeight <= 0) return average(values);

  return values.reduce((total, value, index) => total + value * Math.max(0.1, weights[index] ?? 1), 0) / totalWeight;
}

function robustWeightedAverage(
  values: Array<number | null>,
  weights: number[],
  medianValue: number | null | undefined,
  madValue: number | null | undefined,
) {
  const filtered = values
    .map((value, index) => {
      if (value === null || !Number.isFinite(value)) return null;
      const distance = medianValue === null || medianValue === undefined ? 0 : Math.abs(value - medianValue);
      const scale = Math.max((madValue ?? 0) * 1.4826, 0.02);
      const adjustedValue = medianValue !== null && medianValue !== undefined && distance > scale * 2.5 ? medianValue : value;
      const outlierPenalty = distance > scale * 2.5 ? 0.25 : distance > scale * 1.5 ? 0.6 : 1;
      return { value: adjustedValue, weight: (weights[index] ?? 1) * outlierPenalty };
    })
    .filter((entry): entry is { value: number; weight: number } => entry !== null);

  return filtered.length
    ? weightedAverage(
        filtered.map((entry) => entry.value),
        filtered.map((entry) => entry.weight),
      )
    : null;
}

function robustNullableWeightedAverage(
  values: Array<number | null>,
  weights: number[],
  medianValue: number | null | undefined,
  madValue: number | null | undefined,
) {
  return robustWeightedAverage(values, weights, medianValue, madValue);
}

function robustFeatureStats(features: AudioFeatures[]) {
  const median: BaselineStats["median"] = {};
  const mad: BaselineStats["mad"] = {};
  const iqr: BaselineStats["iqr"] = {};

  for (const key of stdDevFeatureKeys) {
    const values = features
      .map((feature) => getNumericFeatureValue(feature, key))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .sort((left, right) => left - right);
    if (!values.length) {
      median[key] = null;
      mad[key] = null;
      iqr[key] = null;
      continue;
    }

    const center = percentile(values, 0.5);
    const deviations = values.map((value) => Math.abs(value - center)).sort((left, right) => left - right);
    median[key] = center;
    mad[key] = percentile(deviations, 0.5);
    iqr[key] = percentile(values, 0.75) - percentile(values, 0.25);
  }

  return { median, mad, iqr };
}

function weightedStandardDeviation(values: number[], weights: number[]) {
  if (values.length < 2) return 0;

  const mean = weightedAverage(values, weights);
  return Math.sqrt(weightedAverage(values.map((value) => Math.pow(value - mean, 2)), weights));
}

function nullableWeightedStandardDeviation(values: Array<number | null>, weights: number[]) {
  const filtered = values
    .map((value, index) => (value === null ? null : { value, weight: weights[index] ?? 1 }))
    .filter((entry): entry is { value: number; weight: number } => entry !== null);

  return filtered.length > 1
    ? weightedStandardDeviation(
        filtered.map((entry) => entry.value),
        filtered.map((entry) => entry.weight),
      )
    : null;
}

function centeredScore(delta: number) {
  return clamp(0.5 + clamp(delta, -1.5, 1.5) / 3, 0.05, 0.95);
}

function rawStabilityLevel(features: AudioFeatures) {
  const score = getStabilityScore(features);
  return toBars(score ?? (1 - clamp(features.amplitudeStability / 0.05, 0, 1)));
}

function rawMovementLevel(features: AudioFeatures) {
  return toBars(
    clamp(
      (features.pitchRange ?? 0) / 6 +
        (features.noteChangeRate ?? 0) / 3 +
        (features.glideScore ?? 0) * 0.3,
      0,
      1,
    ),
  );
}

function getStabilityScore(features: AudioFeatures) {
  const values = [
    features.smoothnessScore,
    features.sustainStability,
    features.melodicSmoothness,
    1 - clamp(features.amplitudeStability / 0.05, 0, 1),
  ].filter((value): value is number => value !== null);

  return values.length ? average(values) : null;
}

function toBars(value: number) {
  return Math.max(1, Math.min(5, Math.round(clamp(value, 0, 1) * 5)));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function zDelta(
  key: FeatureKey,
  value: number | null,
  baseline: BaselineStats,
  transform: (value: number) => number = (entry) => entry,
) {
  const meanValue = baseline.mean[key];
  if (value === null || meanValue === null || typeof meanValue !== "number") return 0;

  const std = baseline.stdDev[key];
  const denominator = Math.max(typeof std === "number" ? std : 0, epsilonForFeature(key));
  return (transform(value) - transform(meanValue)) / denominator;
}

function getStructuredAdjustedDelta(delta: number, features: AudioFeatures, baseline: BaselineStats) {
  if (delta <= 0) return delta;
  return delta * getIrregularVariationWeight(features, baseline);
}

function getStructuredAdjustedSmoothnessDelta(delta: number, features: AudioFeatures, baseline: BaselineStats) {
  if (delta >= 0) return delta;
  return delta * getIrregularVariationWeight(features, baseline);
}

function getIrregularVariationWeight(features: AudioFeatures, baseline: BaselineStats) {
  const currentVibrato = features.vibratoScore ?? 0;
  const baselineVibrato = baseline.mean.vibratoScore ?? 0;
  const currentGlide = features.glideScore ?? 0;
  const baselineGlide = baseline.mean.glideScore ?? 0;
  const currentPauseStructure = features.pauseStructureScore ?? 0;
  const baselinePauseStructure = baseline.mean.pauseStructureScore ?? 0;
  const familiarVibrato = Math.min(currentVibrato, baselineVibrato);
  const familiarGlide = Math.min(currentGlide, baselineGlide);
  const familiarPhrasing = Math.min(currentPauseStructure, baselinePauseStructure);
  const structuredVariation = Math.max(currentVibrato, currentGlide, currentPauseStructure);

  return clamp(
    1 - familiarVibrato * 0.75 - familiarGlide * 0.65 - familiarPhrasing * 0.45 - structuredVariation * 0.35,
    0.15,
    1,
  );
}

function epsilonForFeature(key: FeatureKey) {
  const epsilons: Record<FeatureKey, number> = {
    rmsEnergy: 0.015,
    inputRms: 0.008,
    meanRms: 0.008,
    medianRms: 0.008,
    activeFrameRatio: 0.08,
    quietFrameRatio: 0.08,
    clippedFrameRatio: 0.02,
    noiseFloorRms: 0.003,
    pitchMean: 12,
    pitchVariance: 180,
    pitchStability: 4,
    jitter: 3,
    vibratoScore: 0.18,
    glideScore: 0.18,
    amplitudeStability: 0.012,
    breakCount: 1,
    avgPauseLength: 0.18,
    pauseCount: 1,
    microBreakRatio: 0.12,
    pauseStructureScore: 0.16,
    smoothnessScore: 0.12,
    pitchRange: 1.5,
    noteChangeRate: 0.18,
    melodicSmoothness: 0.12,
    rhythmicStability: 0.15,
    sustainStability: 0.12,
    breathBreakCount: 1,
    attackConsistency: 0.12,
    pitchContourShape: 0.6,
    silenceRatio: 0.08,
    zeroCrossingRate: 0.02,
    spectralCentroid: 250,
    spectralBandwidth: 250,
    spectralRolloff: 350,
    spectralFlux: 0.2,
    spectralFlatness: 0.08,
    shimmerProxy: 0.05,
    hnrProxy: 0.12,
    signalToNoiseProxy: 3,
    clarityScore: 0.12,
    vibratoRate: 0.8,
    vibratoDepth: 2,
    vibratoRegularity: 0.12,
    tremorProxy: 0.08,
    pitchCoverage: 0.08,
    onsetDelay: 0.2,
    longestStableSegment: 0.6,
    breathinessProxy: 0.1,
    musicalityScore: 0.12,
    controlledExpressionScore: 0.12,
    residualPitchInstability: 0.12,
    residualAmplitudeInstability: 0.12,
    residualInstabilityScore: 0.12,
    stableSegmentCoverage: 0.12,
    voicingContinuityCoverage: 0.12,
    pitchStableSegmentCoverage: 0.12,
    phraseContinuityCoverage: 0.12,
    notePlateauScore: 0.12,
    stepwiseMelodicScore: 0.12,
    repeatedPitchRegionScore: 0.12,
    phraseContourScore: 0.12,
    pitchDrift: 0.08,
  };

  return epsilons[key];
}
