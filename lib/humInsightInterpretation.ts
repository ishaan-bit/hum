import { getBaselineEligibility } from "@/lib/baselineEligibility";
import {
  getFeatureEvidenceSentence,
  getFeatureMeaning,
  getHumFeatureDebugLabel,
  getHumFeatureDisplayLabel,
  getPlainComparisonLabel,
} from "@/lib/humFeatureDisplay";
import {
  getNumericFeatureKeys,
  getNumericFeatureValue,
  humFeatureVectorKeys,
} from "@/lib/humFeatureInventory";
import { analyzeHumState, BASELINE_NEUTRAL_BAND, BASELINE_SESSION_COUNT, getBaseline } from "@/lib/recommendation";
import type { AudioFeatures, BaselineComparison, HumSession, LongitudinalPattern } from "@/types/hum";

export type InsightComparisonDirection = "higher" | "lower" | "similar";
export type InsightComparisonBasis =
  | "stored_baseline_z_score"
  | "computed_baseline_z_score"
  | "recent_average_of_baseline_z_scores";

export type InsightFeatureComparison = {
  key: keyof AudioFeatures;
  label: string;
  meaning: string;
  technicalLabel: string;
  direction: InsightComparisonDirection;
  comparisonLabel: string;
  magnitude: number;
  basis: InsightComparisonBasis;
  normalized: boolean;
  baselineRelative: boolean;
  currentValue: number | null;
  usualValue: number | null;
  zScore: number | null;
  ratio: number | null;
  delta: number | null;
  earlierAverage: number | null;
  recentAverage: number | null;
  earlierCount: number;
  recentCount: number;
  repeatedRecentCount: number;
  evidence: string;
  debugEvidence: string;
};

export type InsightComparisonSection = {
  title: string;
  changed: InsightFeatureComparison[];
  stable: InsightFeatureComparison[];
  all: InsightFeatureComparison[];
  emptyReason: string | null;
};

export type HumDiaryItem = {
  sessionId: string;
  createdAt: string;
  label: string | null;
  evidence: string | null;
  quality: string | null;
  confidence: string | null;
  includedInBaseline: string | null;
  feedback: string | null;
  song: string | null;
  detail: InsightFeatureComparison | null;
};

export type HumInsightInterpretation = {
  usableSessions: HumSession[];
  latestSession: HumSession | null;
  usableCount: number;
  baselineCount: number;
  baselineReady: boolean;
  earlierWindowCount: number;
  recentWindowCount: number;
  earlierBroadLabel: string | null;
  recentBroadLabel: string | null;
  todayVsUsual: InsightComparisonSection;
  recentVsEarlier: InsightComparisonSection;
  patternState: LongitudinalPattern;
  patternReason: string;
  latestAverageDistance: number | null;
  recentAverageDistance: number | null;
  earlierAverageDistance: number | null;
  movingTowardUsual: boolean;
  sameBroadStateDifferentTexture: boolean;
  diary: HumDiaryItem[];
  feedbackTargetId: string;
};

const comparisonLimit = 5;

export function buildHumInsightInterpretation(sessions: HumSession[]): HumInsightInterpretation {
  const usableSessions = sessions
    .filter((session) => getBaselineEligibility(session).eligible)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const latestSession = usableSessions[usableSessions.length - 1] ?? null;
  const baselineCount = latestSession?.baselineComparison?.baselineCount ?? latestSession?.validBaselineCount ?? usableSessions.length;
  const baselineReady = baselineCount >= BASELINE_SESSION_COUNT;
  const todayVsUsual = buildTodayVsUsual(latestSession, usableSessions);
  const windowComparison = buildRecentVsEarlier(usableSessions);
  const latestAverageDistance = averageMagnitude(todayVsUsual.all);
  const movingTowardUsual = isMovingTowardUsual(windowComparison.earlierDistance, windowComparison.recentDistance);
  const sameBroadStateDifferentTexture =
    Boolean(windowComparison.earlierBroadLabel) &&
    windowComparison.earlierBroadLabel === windowComparison.recentBroadLabel &&
    windowComparison.section.changed.length > 0;
  const pattern = classifyPatternState({
    usableCount: usableSessions.length,
    baselineReady,
    todayVsUsual,
    recentVsEarlier: windowComparison.section,
    movingTowardUsual,
  });
  const feedbackTargetId = buildFeedbackTargetId({
    latestSession,
    patternState: pattern.state,
    todayVsUsual,
    recentVsEarlier: windowComparison.section,
    usableCount: usableSessions.length,
  });

  return {
    usableSessions,
    latestSession,
    usableCount: usableSessions.length,
    baselineCount,
    baselineReady,
    earlierWindowCount: windowComparison.earlierCount,
    recentWindowCount: windowComparison.recentCount,
    earlierBroadLabel: windowComparison.earlierBroadLabel,
    recentBroadLabel: windowComparison.recentBroadLabel,
    todayVsUsual,
    recentVsEarlier: windowComparison.section,
    patternState: pattern.state,
    patternReason: pattern.reason,
    latestAverageDistance,
    recentAverageDistance: windowComparison.recentDistance,
    earlierAverageDistance: windowComparison.earlierDistance,
    movingTowardUsual,
    sameBroadStateDifferentTexture,
    diary: buildDiary(usableSessions),
    feedbackTargetId,
  };
}

export function getInsightComparisonSummary(section: InsightComparisonSection) {
  const changed = section.changed[0];
  if (changed) return `${changed.label} ${changed.comparisonLabel}`;
  const stable = section.stable[0];
  if (stable) return `${stable.label} similar`;
  return section.emptyReason ?? "No comparable values yet";
}

export function getPatternStateCopy(interpretation: HumInsightInterpretation) {
  const todayTop = interpretation.todayVsUsual.changed[0];
  const recentTop = interpretation.recentVsEarlier.changed[0];

  if (interpretation.patternState === "too_early") {
    return {
      title: "Too early for a thread",
      summary: `${interpretation.usableCount} usable ${plural(interpretation.usableCount, "hum")} saved. A trend needs more than one or two hums.`,
    };
  }

  if (interpretation.patternState === "baseline_learning") {
    const count = Math.min(interpretation.baselineCount, interpretation.usableCount);
    return {
      title: "Baseline still learning",
      summary: `Hum has ${count} usable ${plural(count, "hum")} toward your usual shape.`,
    };
  }

  if (interpretation.patternState === "moving_back_toward_usual") {
    return {
      title: "Moving closer to usual",
      summary: "Recent hums are closer to your usual shape than the earlier part of this thread.",
    };
  }

  if (interpretation.patternState === "repeating_shift") {
    return {
      title: interpretation.sameBroadStateDifferentTexture ? "Same broad state, different texture" : "This has repeated",
      summary: recentTop
        ? `${recentTop.evidence.replace(/\.$/, "")} across multiple recent usable hums.`
        : "A recent shift shows up across multiple usable hums.",
    };
  }

  if (interpretation.patternState === "single_hum_shift") {
    return {
      title: "Today stands out",
      summary: todayTop
        ? `${todayTop.evidence.replace(/\.$/, "")}, but it has not repeated yet.`
        : "Your latest hum stands apart from the recent thread, but it has not repeated yet.",
    };
  }

  if (interpretation.patternState === "mixed") {
    return {
      title: "Mixed but mostly close",
      summary: "Today changed in a couple of details, but your broader hum shape is still close to usual.",
    };
  }

  if (interpretation.patternState === "stable") {
    return {
      title: "No clear shift yet",
      summary: "Your latest and recent hums are close to your usual pattern.",
    };
  }

  return {
    title: "Unclear thread",
    summary: "Hum has saved the records, but there is not enough comparable baseline data to call a pattern.",
  };
}

function buildTodayVsUsual(
  latestSession: HumSession | null,
  usableSessions: HumSession[],
): InsightComparisonSection {
  if (!latestSession) return emptySection("Today vs usual", "No usable hum has been saved yet.");

  const comparison = getLatestBaselineComparison(latestSession, usableSessions);
  if (!comparison || comparison.baselineCount < BASELINE_SESSION_COUNT) {
    return emptySection("Today vs usual", "Hum is still learning your usual pattern.");
  }

  const keys = getNumericFeatureKeys(latestSession);
  const all = keys
    .map((key) => comparisonFromBaseline(key, latestSession.features, comparison, "stored_baseline_z_score"))
    .filter((entry): entry is InsightFeatureComparison => entry !== null)
    .sort((left, right) => right.magnitude - left.magnitude);

  return sectionFromComparisons("Today vs usual", all, "No comparable hum details are available yet.");
}

function buildRecentVsEarlier(usableSessions: HumSession[]) {
  if (usableSessions.length < 3) {
    return {
      section: emptySection("Recent vs earlier", "A few more usable hums are needed before recent and earlier hums can be compared."),
      earlierCount: 0,
      recentCount: usableSessions.length,
      earlierBroadLabel: null,
      recentBroadLabel: null,
      earlierDistance: null,
      recentDistance: null,
    };
  }

  const { earlier, recent } = splitWindows(usableSessions);
  const fallbackBaseline = getBaseline(usableSessions);
  const comparisonBySession = new Map<string, BaselineComparison>();
  const all = humFeatureVectorKeys
    .map((key) => comparisonFromWindowZScores(key, earlier, recent, fallbackBaseline, comparisonBySession))
    .filter((entry): entry is InsightFeatureComparison => entry !== null)
    .sort((left, right) => right.magnitude - left.magnitude);

  return {
    section: sectionFromComparisons(
      "Recent vs earlier",
      all,
      "Recent and earlier hums do not have enough shared comparison detail yet.",
    ),
    earlierCount: earlier.length,
    recentCount: recent.length,
    earlierBroadLabel: mostCommonLabel(earlier),
    recentBroadLabel: mostCommonLabel(recent),
    earlierDistance: averageWindowDistance(earlier),
    recentDistance: averageWindowDistance(recent),
  };
}

function comparisonFromBaseline(
  key: keyof AudioFeatures,
  features: AudioFeatures,
  comparison: BaselineComparison,
  basis: InsightComparisonBasis,
): InsightFeatureComparison | null {
  const currentValue = getNumericFeatureValue(features, key);
  const zScore = getComparableNumber(comparison.zScores[key]);
  if (currentValue === null || zScore === null) return null;

  const ratio = getComparableNumber(comparison.ratios[key]);
  const usualValue = ratio !== null && ratio > 0 ? currentValue / ratio : null;
  const direction = Math.abs(zScore) < BASELINE_NEUTRAL_BAND ? "similar" : zScore > 0 ? "higher" : "lower";
  const magnitude = round(Math.abs(zScore));
  const label = getHumFeatureDebugLabel(key);

  return {
    key,
    label: getHumFeatureDisplayLabel(key),
    meaning: getFeatureMeaning(key),
    technicalLabel: label,
    direction,
    comparisonLabel: getPlainComparisonLabel(key, direction, magnitude),
    magnitude,
    basis,
    normalized: true,
    baselineRelative: true,
    currentValue,
    usualValue,
    zScore,
    ratio,
    delta: zScore,
    earlierAverage: null,
    recentAverage: null,
    earlierCount: 0,
    recentCount: 1,
    repeatedRecentCount: direction === "similar" ? 0 : 1,
    evidence: getFeatureEvidenceSentence({ key, direction, magnitude, window: "today" }),
    debugEvidence: `${label} ${direction} than usual (${formatSigned(zScore)} vs usual)`,
  };
}

function comparisonFromWindowZScores(
  key: keyof AudioFeatures,
  earlier: HumSession[],
  recent: HumSession[],
  fallbackBaseline: ReturnType<typeof getBaseline>,
  comparisonBySession: Map<string, BaselineComparison>,
): InsightFeatureComparison | null {
  const earlierScores = getWindowZScores(earlier, key, fallbackBaseline, comparisonBySession);
  const recentScores = getWindowZScores(recent, key, fallbackBaseline, comparisonBySession);
  if (!earlierScores.length || !recentScores.length) return null;

  const earlierAverage = average(earlierScores);
  const recentAverage = average(recentScores);
  const delta = recentAverage - earlierAverage;
  const direction = Math.abs(delta) < BASELINE_NEUTRAL_BAND ? "similar" : delta > 0 ? "higher" : "lower";
  const repeatedRecentCount = recentScores.filter((value) =>
    direction === "higher" ? value >= BASELINE_NEUTRAL_BAND : direction === "lower" ? value <= -BASELINE_NEUTRAL_BAND : false,
  ).length;
  const magnitude = round(Math.abs(delta));
  const label = getHumFeatureDebugLabel(key);

  return {
    key,
    label: getHumFeatureDisplayLabel(key),
    meaning: getFeatureMeaning(key),
    technicalLabel: label,
    direction,
    comparisonLabel: getPlainComparisonLabel(key, direction, magnitude),
    magnitude,
    basis: "recent_average_of_baseline_z_scores",
    normalized: true,
    baselineRelative: true,
    currentValue: null,
    usualValue: null,
    zScore: null,
    ratio: null,
    delta: round(delta),
    earlierAverage: round(earlierAverage),
    recentAverage: round(recentAverage),
    earlierCount: earlierScores.length,
    recentCount: recentScores.length,
    repeatedRecentCount,
    evidence: getFeatureEvidenceSentence({ key, direction, magnitude, window: "recent" }),
    debugEvidence: `${label} ${direction} recently (${formatSigned(delta)} recent vs earlier)`,
  };
}

function sectionFromComparisons(
  title: string,
  all: InsightFeatureComparison[],
  emptyReason: string,
): InsightComparisonSection {
  if (!all.length) return emptySection(title, emptyReason);

  const changed = all.filter((entry) => entry.direction !== "similar").slice(0, comparisonLimit);
  const stable = [...all]
    .filter((entry) => entry.direction === "similar")
    .sort((left, right) => left.magnitude - right.magnitude)
    .slice(0, comparisonLimit);

  return {
    title,
    changed,
    stable,
    all,
    emptyReason: null,
  };
}

function emptySection(title: string, emptyReason: string): InsightComparisonSection {
  return {
    title,
    changed: [],
    stable: [],
    all: [],
    emptyReason,
  };
}

function getLatestBaselineComparison(latestSession: HumSession, usableSessions: HumSession[]) {
  if (latestSession.baselineComparison) return latestSession.baselineComparison;

  const previousSessions = usableSessions.filter((session) => getSessionId(session) !== getSessionId(latestSession));
  const previousBaseline = getBaseline(previousSessions);
  if (!previousBaseline) return null;

  return analyzeHumState(latestSession.features, previousBaseline).baselineComparison;
}

function classifyPatternState({
  usableCount,
  baselineReady,
  todayVsUsual,
  recentVsEarlier,
  movingTowardUsual,
}: {
  usableCount: number;
  baselineReady: boolean;
  todayVsUsual: InsightComparisonSection;
  recentVsEarlier: InsightComparisonSection;
  movingTowardUsual: boolean;
}): { state: LongitudinalPattern; reason: string } {
  if (usableCount <= 2) return { state: "too_early", reason: "one or two usable hums cannot form a trend" };
  if (usableCount < BASELINE_SESSION_COUNT) return { state: "baseline_learning", reason: "fewer than five usable hums in this thread" };
  if (!baselineReady) return { state: "baseline_learning", reason: "baseline comparison is still forming" };
  if (!todayVsUsual.all.length && !recentVsEarlier.all.length) {
    return { state: "unclear", reason: "stored hums do not share comparable baseline fields yet" };
  }
  if (movingTowardUsual) return { state: "moving_back_toward_usual", reason: "recent average baseline distance decreased" };

  if (hasMixedDirection(recentVsEarlier.changed)) {
    return { state: "mixed", reason: "changed values do not point in one clean direction" };
  }

  const repeated = recentVsEarlier.changed.some((entry) => entry.repeatedRecentCount >= 2);
  if (repeated) return { state: "repeating_shift", reason: "the same feature direction appears in multiple recent hums" };

  if (todayVsUsual.changed.length && !recentVsEarlier.changed.length) {
    return { state: "single_hum_shift", reason: "latest hum changed without a repeated recent shift" };
  }

  if (todayVsUsual.changed.length && recentVsEarlier.changed.length) {
    return { state: "mixed", reason: "changed values do not point in one clean direction" };
  }

  if (!todayVsUsual.changed.length && !recentVsEarlier.changed.length) {
    return { state: "stable", reason: "no feature crossed the existing baseline neutral band" };
  }

  return { state: "unclear", reason: "change is present but not repeated clearly" };
}

function splitWindows(sessions: HumSession[]) {
  if (sessions.length < 9) {
    const split = Math.floor(sessions.length / 2);
    return {
      earlier: sessions.slice(0, split),
      recent: sessions.slice(split),
    };
  }

  const baseSize = Math.floor(sessions.length / 3);
  const remainder = sessions.length % 3;
  const earlierSize = baseSize + (remainder > 0 ? 1 : 0);
  const middleSize = baseSize + (remainder > 1 ? 1 : 0);

  return {
    earlier: sessions.slice(0, earlierSize + middleSize),
    recent: sessions.slice(earlierSize + middleSize),
  };
}

function getWindowZScores(
  sessions: HumSession[],
  key: keyof AudioFeatures,
  fallbackBaseline: ReturnType<typeof getBaseline>,
  comparisonBySession: Map<string, BaselineComparison>,
) {
  return sessions
    .map((session) => {
      const stored = getComparableNumber(session.baselineComparison?.zScores[key]);
      if (stored !== null) return stored;
      const computed = getComputedComparison(session, fallbackBaseline, comparisonBySession);
      return getComparableNumber(computed?.zScores[key]);
    })
    .filter((value): value is number => value !== null);
}

function getComputedComparison(
  session: HumSession,
  fallbackBaseline: ReturnType<typeof getBaseline>,
  comparisonBySession: Map<string, BaselineComparison>,
) {
  if (!fallbackBaseline) return null;
  const id = getSessionId(session);
  const cached = comparisonBySession.get(id);
  if (cached) return cached;

  const computed = analyzeHumState(session.features, fallbackBaseline).baselineComparison;
  if (computed) comparisonBySession.set(id, computed);
  return computed;
}

function averageWindowDistance(sessions: HumSession[]) {
  const distances = sessions
    .map((session) => {
      const values = Object.values(session.baselineComparison?.zScores ?? {}).filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value),
      );
      return values.length ? average(values.map((value) => Math.abs(value))) : null;
    })
    .filter((value): value is number => value !== null);

  return distances.length ? round(average(distances)) : null;
}

function isMovingTowardUsual(earlierDistance: number | null, recentDistance: number | null) {
  if (earlierDistance === null || recentDistance === null) return false;
  return earlierDistance - recentDistance >= BASELINE_NEUTRAL_BAND;
}

function averageMagnitude(comparisons: InsightFeatureComparison[]) {
  return comparisons.length ? round(average(comparisons.map((entry) => entry.magnitude))) : null;
}

function buildDiary(sessions: HumSession[]): HumDiaryItem[] {
  return [...sessions].reverse().map((session) => {
    const topComparison = getTopStoredComparison(session);
    const feedback = session.musicSession?.feedback?.regulationOutcome ?? session.userFeedback ?? session.feedback ?? null;

    return {
      sessionId: getSessionId(session),
      createdAt: session.createdAt,
      label: session.signal ?? session.musicSession?.hum.stateLabel ?? null,
      evidence: topComparison?.evidence ?? null,
      quality: formatQuality(session.captureQuality ?? session.qualityDecision?.captureQuality ?? session.quality ?? null),
      confidence: formatConfidence(session.labelConfidence ?? session.confidenceWeight ?? session.mlData?.signalConfidence ?? null),
      includedInBaseline:
        typeof session.includedInBaseline === "boolean"
          ? session.includedInBaseline
            ? "Included in baseline"
            : "Not in baseline"
          : null,
      feedback: feedback ? formatFeedback(`${feedback}`) : null,
      song: null,
      detail: topComparison,
    };
  });
}

function getTopStoredComparison(session: HumSession) {
  const comparisons = getNumericFeatureKeys(session)
    .map((key) =>
      session.baselineComparison
        ? comparisonFromBaseline(key, session.features, session.baselineComparison, "stored_baseline_z_score")
        : null,
    )
    .filter((entry): entry is InsightFeatureComparison => entry !== null)
    .sort((left, right) => right.magnitude - left.magnitude);

  return comparisons[0] ?? null;
}

function buildFeedbackTargetId({
  latestSession,
  patternState,
  todayVsUsual,
  recentVsEarlier,
  usableCount,
}: {
  latestSession: HumSession | null;
  patternState: LongitudinalPattern;
  todayVsUsual: InsightComparisonSection;
  recentVsEarlier: InsightComparisonSection;
  usableCount: number;
}) {
  const evidenceKeys = [
    ...todayVsUsual.changed.slice(0, 3).map((entry) => `${entry.key}:${entry.direction}:${entry.zScore ?? entry.delta}`),
    ...recentVsEarlier.changed.slice(0, 3).map((entry) => `${entry.key}:${entry.direction}:${entry.delta}`),
  ];

  return [
    "thread",
    patternState,
    latestSession ? getSessionId(latestSession) : "none",
    usableCount,
    evidenceKeys.join("|") || "no-change",
  ].join(":");
}

function mostCommonLabel(sessions: HumSession[]) {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    if (!session.signal) continue;
    counts.set(session.signal, (counts.get(session.signal) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function hasMixedDirection(comparisons: InsightFeatureComparison[]) {
  const directions = new Set(comparisons.map((entry) => entry.direction).filter((direction) => direction !== "similar"));
  return directions.size > 1;
}

function getComparableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getSessionId(session: HumSession) {
  return session.sessionId || session.id;
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatSigned(value: number) {
  const rounded = round(value);
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}`;
}

function formatConfidence(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}% confidence`;
}

function formatQuality(value: string | null) {
  if (!value) return null;
  const labels: Record<string, string> = {
    clean: "Good quality",
    good: "Good quality",
    usable: "Usable quality",
    soft_usable: "Soft but usable",
    borderline: "Usable quality",
    poor: "Low quality",
  };
  return labels[value] ?? humanizeValue(value);
}

function formatFeedback(value: string) {
  return humanizeValue(value);
}

function humanizeValue(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function plural(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`;
}
