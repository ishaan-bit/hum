import {
  buildHumInsightInterpretation,
  type HumInsightInterpretation,
  type InsightComparisonSection,
} from "@/lib/humInsightInterpretation";
import type {
  AudioFeatures,
  HumSession,
  LongitudinalPattern,
  ThreadBehaviorSignal,
  ThreadFeedbackEntry,
  ThreadInsight,
  ThreadPatternTone,
  ThreadStageScores,
} from "@/types/hum";

export type ThreadInsightDebug = {
  totalSessionCount: number;
  eligibleSessionCount: number;
  usedInThreadCalculation: number;
  daysCovered: number;
  cleanRatio: number;
  confidenceLabel: string;
  segmentSizes: Record<string, number>;
  chosenPatternType: LongitudinalPattern;
  topMetricDeltas: Array<{ key: string; value: number }>;
  fallbackReason?: string;
  stageScores?: ThreadStageScores;
  timelineSessionIds: string[];
  readFeedbackInfluence: {
    tooStrongCount: number;
    notQuiteCount: number;
    tooSoftCount: number;
    fitsCount: number;
    softened: boolean;
  };
  debugMetrics?: ThreadDebugMetrics;
};

export type ThreadInsightResult = ThreadInsight & {
  debug: ThreadInsightDebug;
};

type BuildThreadInsightInput = {
  sessions: HumSession[];
  readFeedback?: ThreadFeedbackEntry[];
};

type ThreadStage =
  | "BASELINE_LEARNING_1"
  | "BASELINE_LEARNING_2_TO_4"
  | "EARLY_BASELINE_5"
  | "EARLY_BASELINE_6_TO_9"
  | "GROWING_BASELINE_10_TO_19"
  | "STRONG_BASELINE_20_PLUS";

type ThreadStateId =
  | "BASELINE_ONE_CLEAN_POINT"
  | "BASELINE_COLLECTING_RANGE"
  | "BASELINE_READY_NEXT_HUM"
  | "FIRST_BASELINE_ACTIVE"
  | "STEADY_BASELINE_HOLDING"
  | "CALMER_THAN_RECENT"
  | "MORE_CENTERED_THAN_RECENT"
  | "PRESSURE_BUILDING"
  | "PRESSURE_HOLDING_STEADY"
  | "PRESSURE_EASING"
  | "STRESS_SPIKE_ONE_OFF"
  | "STRESS_SPIKE_REPEATING"
  | "BRACING_PATTERN"
  | "ANTICIPATION_LOOP"
  | "RESTLESS_PATTERN"
  | "OVERLOAD_BUILDING"
  | "OVERLOAD_EASING"
  | "ENERGY_RISING_CLEANLY"
  | "ENERGY_RISING_WITH_STRAIN"
  | "ENERGY_DIPPING"
  | "LOW_RECOVERY_PATTERN"
  | "WIRED_TIRED_REPEATING"
  | "SLEEP_DEPRIVED_LIKE_PATTERN"
  | "MUTED_PATTERN"
  | "LOW_MOOD_LIKE_PATTERN"
  | "DEPRESSION_LIKE_HEAVINESS_PATTERN"
  | "EMOTIONAL_LOAD_REPEATING"
  | "HOLDING_BACK_PATTERN"
  | "EXPRESSION_OPENING"
  | "EXPRESSION_WITH_STRAIN"
  | "CONTROL_IMPROVING"
  | "CONTROL_DROPPING"
  | "VOICE_MORE_CONTINUOUS"
  | "VOICE_MORE_INTERRUPTED"
  | "VOLATILE_PATTERN"
  | "MIXED_BUT_STABLE"
  | "RECOVERY_AFTER_PRESSURE"
  | "DROP_AFTER_HIGH_ENERGY"
  | "THREAD_UNCLEAR_GOOD_DATA"
  | "THREAD_UNCLEAR_WEAK_DATA";

type ThreadFamily =
  | "baseline learning"
  | "stable"
  | "pressure build-up"
  | "stress spike"
  | "anxiety-like recurrence"
  | "overload"
  | "recovery"
  | "energy dip"
  | "low-recovery"
  | "low-mood-like"
  | "emotional load"
  | "expression shift"
  | "volatility"
  | "mixed"
  | "unclear";

type ThreadDimensions = {
  captureQualityScore: number;
  cleanlinessConfidenceScore: number;
  energyScore: number;
  volumeControlScore: number;
  pitchMovementScore: number;
  stabilityScore: number;
  expressionMusicalityScore: number;
  residualInstabilityComposite: number;
  continuityScore: number;
  fatigueRecoveryScore: number;
  moodHeavinessScore: number;
  toneColorScore: number;
  activationScore: number;
  controlScore: number;
};

type DimensionKey = keyof ThreadDimensions;

type ThreadPoint = {
  session: HumSession;
  dimensions: ThreadDimensions;
  readId: string | null;
  readFamily: string | null;
};

type WindowStats = {
  count: number;
  median: ThreadDimensions;
};

type ThreadDebugMetrics = {
  stage: ThreadStage;
  stateId: ThreadStateId;
  earlierCount: number;
  recentCount: number;
  cleanRatio: number;
  trends: Partial<Record<DimensionKey, number>>;
  deltas: Partial<Record<DimensionKey, number>>;
  repeatedReadId: string | null;
  pressureEvidenceFamilies: string[];
  volatility: number;
  oneOffSpikeScore: number;
  buildUpScore: number;
  recoveryScore: number;
  dipScore: number;
  mixedPatternScore: number;
};

type Analysis = {
  stateId: ThreadStateId;
  stage: ThreadStage;
  usable: ThreadPoint[];
  earlier: ThreadPoint[];
  recent: ThreadPoint[];
  earlierStats: WindowStats;
  recentStats: WindowStats;
  daysCovered: number;
  cleanRatio: number;
  deltas: Partial<Record<DimensionKey, number>>;
  trends: Partial<Record<DimensionKey, number>>;
  repeatedReadId: string | null;
  repeatedReadCount: number;
  pressureEvidenceFamilies: string[];
  volatility: number;
  oneOffSpikeScore: number;
  buildUpScore: number;
  recoveryScore: number;
  dipScore: number;
  mixedPatternScore: number;
  feedbackInfluence: ThreadInsightDebug["readFeedbackInfluence"];
  debugMetrics: ThreadDebugMetrics;
};

type ThreadTemplate = {
  family: ThreadFamily;
  title: string;
  headline: string;
  main: string;
  whatChanged: string;
  whatStayed: string;
  whatThisMayReflect: string;
  whatToDo: string;
  chips: string[];
  tone: ThreadPatternTone;
  concernLevel?: ThreadInsight["concernLevel"];
  guardrailNote?: string;
};

const dimensionKeys: DimensionKey[] = [
  "captureQualityScore",
  "cleanlinessConfidenceScore",
  "energyScore",
  "volumeControlScore",
  "pitchMovementScore",
  "stabilityScore",
  "expressionMusicalityScore",
  "residualInstabilityComposite",
  "continuityScore",
  "fatigueRecoveryScore",
  "moodHeavinessScore",
  "toneColorScore",
  "activationScore",
  "controlScore",
];

const emptyDimensions: ThreadDimensions = {
  captureQualityScore: 0.5,
  cleanlinessConfidenceScore: 0.5,
  energyScore: 0.5,
  volumeControlScore: 0.5,
  pitchMovementScore: 0.5,
  stabilityScore: 0.5,
  expressionMusicalityScore: 0.5,
  residualInstabilityComposite: 0.5,
  continuityScore: 0.5,
  fatigueRecoveryScore: 0.5,
  moodHeavinessScore: 0.5,
  toneColorScore: 0.5,
  activationScore: 0.5,
  controlScore: 0.5,
};

export function buildThreadInsight(input: HumSession[] | BuildThreadInsightInput): ThreadInsightResult {
  const sessions = Array.isArray(input) ? input : input.sessions;
  const readFeedback = Array.isArray(input) ? [] : (input.readFeedback ?? []);
  const interpretation = buildHumInsightInterpretation(sessions);
  const feedbackInfluence = getFeedbackInfluence(readFeedback, interpretation.feedbackTargetId);
  const analysis = analyzeThread(interpretation, feedbackInfluence);
  const template = getThreadTemplate(analysis);
  const daysCovered = analysis.daysCovered;
  const confidenceLabel = getConfidenceLabel(analysis.stage);
  const timelineSessionIds = interpretation.usableSessions
    .slice()
    .reverse()
    .map((session) => session.sessionId || session.id);
  const evidenceChips = buildEvidenceChips(analysis, template);
  const behaviorSignals = toBehaviorSignals(evidenceChips, analysis);
  const feedbackLine = getFeedbackLine(analysis.feedbackInfluence);
  const repetitionLine = getRepeatedReadLine(analysis);
  const whatThisMayReflect = [feedbackLine, template.whatThisMayReflect, repetitionLine].filter(Boolean).join(" ");
  const evidenceLine = `${getStageMetaLabel(analysis.stage)} · ${analysis.usable.length} usable ${plural(
    analysis.usable.length,
    "hum",
  )} · ${daysCovered || 0} ${plural(daysCovered || 0, "day")}`;
  const comparisonSummary = getComparisonSummary(analysis);
  const pattern = analysis.stateId as LongitudinalPattern;
  const insight: ThreadInsight = {
    pattern,
    patternType: pattern,
    patternTone: template.tone,
    concernLevel: template.concernLevel ?? "none",
    evidenceCount: analysis.usable.length,
    daysCovered,
    cleanRatio: round(analysis.cleanRatio),
    patternStrength: getPatternStrength(analysis),
    confidence: getConfidence(analysis),
    threadId: buildThreadId(analysis, interpretation.feedbackTargetId),
    family: template.family,
    stage: analysis.stage,
    title: template.title,
    threadTitle: template.title,
    headline: template.headline,
    summary: template.main,
    threadSummary: template.main,
    usableHumCount: analysis.usable.length,
    windowLabel: getWindowLabel(analysis),
    earlierLabel: getWindowPartLabel("Earlier hums", analysis.earlier.length),
    earlierSummary: getWindowSummary(analysis.earlierStats, analysis.stage, "earlier"),
    recentLabel: getWindowPartLabel("Recent hums", analysis.recent.length),
    recentSummary: getWindowSummary(analysis.recentStats, analysis.stage, "recent"),
    comparisonSummary,
    whatThisMayReflect,
    whatChanged: template.whatChanged,
    whatRepeated: template.whatStayed,
    whatStayedWithYou: template.whatStayed,
    whatItMayMean: whatThisMayReflect,
    whatToDo: template.whatToDo,
    tryThis: template.whatToDo,
    evidenceChips,
    guardrailNote: template.guardrailNote,
    debugMetrics: analysis.debugMetrics,
    dataSummary: {
      usableHums: analysis.usable.length,
      daysCovered,
      confidenceLabel,
    },
    phaseLabels: buildPhaseLabels(analysis),
    mainInsight: template.main,
    evidence: evidenceChips,
    tags: evidenceChips,
    behaviorSummary: template.main,
    behaviorPattern: comparisonSummary,
    behaviorSignals,
    evidenceLine,
    interpretation: template.main,
    musicDirection: evidenceChips,
    stageScores: buildStageScores(analysis),
    keyHumSessionIds: timelineSessionIds,
    timelineSessionIds,
    feedbackTargetId: interpretation.feedbackTargetId,
    todayVsUsual: toInsightSection(interpretation.todayVsUsual),
    recentVsEarlier: toInsightSection(interpretation.recentVsEarlier),
    diary: interpretation.diary,
    eligibilityReason: getEligibilityReason(analysis, interpretation),
  };

  return withDebug(insight, {
    totalSessionCount: sessions.length,
    eligibleSessionCount: analysis.usable.length,
    usedInThreadCalculation: analysis.usable.length,
    daysCovered,
    cleanRatio: round(analysis.cleanRatio),
    confidenceLabel,
    segmentSizes: {
      earlier: analysis.earlier.length,
      recent: analysis.recent.length,
    },
    chosenPatternType: pattern,
    topMetricDeltas: getTopDeltas(analysis),
    fallbackReason: insight.eligibilityReason,
    stageScores: insight.stageScores,
    timelineSessionIds,
    readFeedbackInfluence: feedbackInfluence,
    debugMetrics: analysis.debugMetrics,
  });
}

export function selectKeyHumsForThread({
  sessions,
  maxCount = 6,
}: {
  sessions: Array<HumSession | { session: HumSession }>;
  pattern?: LongitudinalPattern;
  stageScores?: ThreadStageScores;
  perSessionScores?: unknown[];
  maxCount?: number;
}): string[] {
  return sessions
    .map((entry) => ("session" in entry ? entry.session : entry))
    .slice(-maxCount)
    .reverse()
    .map((session) => session.sessionId || session.id);
}

function analyzeThread(
  interpretation: HumInsightInterpretation,
  feedbackInfluence: ThreadInsightDebug["readFeedbackInfluence"],
): Analysis {
  const usable = interpretation.usableSessions.map(toThreadPoint);
  const stage = getThreadStage(usable.length);
  const windows = splitWindows(usable);
  const earlierStats = getWindowStats(windows.earlier);
  const recentStats = getWindowStats(windows.recent);
  const deltas = subtractDimensions(recentStats.median, earlierStats.median);
  const trends = getTrends(usable);
  const cleanRatio = getCleanRatio(interpretation.usableSessions);
  const readCounts = getRepeatedRead(usable);
  const pressureEvidenceFamilies = getPressureEvidenceFamilies(recentStats, earlierStats, deltas, stage);
  const volatility = getVolatility(windows.recent.length ? windows.recent : usable);
  const oneOffSpikeScore = getOneOffSpikeScore(usable);
  const buildUpScore = averagePositive([trends.activationScore ?? 0, trends.residualInstabilityComposite ?? 0, -(trends.stabilityScore ?? 0)]);
  const recoveryScore = averagePositive([-(deltas.activationScore ?? 0), deltas.stabilityScore ?? 0, deltas.continuityScore ?? 0]);
  const dipScore = averagePositive([-(deltas.energyScore ?? 0), -(deltas.expressionMusicalityScore ?? 0), -(deltas.toneColorScore ?? 0)]);
  const mixedPatternScore = getMixedPatternScore(deltas, volatility);
  const stateId = selectThreadState({
    usable,
    stage,
    earlierStats,
    recentStats,
    deltas,
    trends,
    cleanRatio,
    repeatedReadId: readCounts.readId,
    repeatedReadCount: readCounts.count,
    pressureEvidenceFamilies,
    volatility,
    oneOffSpikeScore,
    buildUpScore,
    recoveryScore,
    dipScore,
    mixedPatternScore,
    feedbackInfluence,
  });
  const debugMetrics: ThreadDebugMetrics = {
    stage,
    stateId,
    earlierCount: windows.earlier.length,
    recentCount: windows.recent.length,
    cleanRatio: round(cleanRatio),
    trends: roundRecord(trends),
    deltas: roundRecord(deltas),
    repeatedReadId: readCounts.readId,
    pressureEvidenceFamilies,
    volatility: round(volatility),
    oneOffSpikeScore: round(oneOffSpikeScore),
    buildUpScore: round(buildUpScore),
    recoveryScore: round(recoveryScore),
    dipScore: round(dipScore),
    mixedPatternScore: round(mixedPatternScore),
  };

  return {
    stateId,
    stage,
    usable,
    earlier: windows.earlier,
    recent: windows.recent,
    earlierStats,
    recentStats,
    daysCovered: countDaysCovered(interpretation.usableSessions),
    cleanRatio,
    deltas,
    trends,
    repeatedReadId: readCounts.readId,
    repeatedReadCount: readCounts.count,
    pressureEvidenceFamilies,
    volatility,
    oneOffSpikeScore,
    buildUpScore,
    recoveryScore,
    dipScore,
    mixedPatternScore,
    feedbackInfluence,
    debugMetrics,
  };
}

function selectThreadState(input: {
  usable: ThreadPoint[];
  stage: ThreadStage;
  earlierStats: WindowStats;
  recentStats: WindowStats;
  deltas: Partial<Record<DimensionKey, number>>;
  trends: Partial<Record<DimensionKey, number>>;
  cleanRatio: number;
  repeatedReadId: string | null;
  repeatedReadCount: number;
  pressureEvidenceFamilies: string[];
  volatility: number;
  oneOffSpikeScore: number;
  buildUpScore: number;
  recoveryScore: number;
  dipScore: number;
  mixedPatternScore: number;
  feedbackInfluence: ThreadInsightDebug["readFeedbackInfluence"];
}): ThreadStateId {
  const { usable, stage, recentStats, deltas, trends } = input;
  const recent = recentStats.median;
  const tooStrongPressureFeedback = input.feedbackInfluence.tooStrongCount >= 2;
  const energyLower = (deltas.energyScore ?? 0) <= -0.1;
  const energyNormalOrHigher = recent.energyScore >= 0.46;

  if (usable.length <= 1) return "BASELINE_ONE_CLEAN_POINT";
  if (usable.length === 4) return "BASELINE_READY_NEXT_HUM";
  if (usable.length < 5) return "BASELINE_COLLECTING_RANGE";
  if (usable.length === 5) return "FIRST_BASELINE_ACTIVE";
  if (input.cleanRatio < 0.55) return "THREAD_UNCLEAR_WEAK_DATA";

  if (input.oneOffSpikeScore >= 0.72) return "STRESS_SPIKE_ONE_OFF";
  if (countRecentSpikes(input.usable) >= 2) return "STRESS_SPIKE_REPEATING";
  if (hasLowMoodPattern(input.usable, 3) && stage !== "EARLY_BASELINE_6_TO_9") return "DEPRESSION_LIKE_HEAVINESS_PATTERN";
  if (hasLowMoodPattern(input.usable, 2)) return "LOW_MOOD_LIKE_PATTERN";
  if (hasSleepDeprivedPattern(input.usable)) return "SLEEP_DEPRIVED_LIKE_PATTERN";
  if (recent.fatigueRecoveryScore >= 0.68 && recent.activationScore >= 0.62) return "WIRED_TIRED_REPEATING";
  if (recent.fatigueRecoveryScore >= 0.66 && recent.energyScore <= 0.45) return "LOW_RECOVERY_PATTERN";
  if ((deltas.energyScore ?? 0) >= 0.12 && recent.controlScore >= 0.56 && recent.residualInstabilityComposite < 0.5) {
    return "ENERGY_RISING_CLEANLY";
  }
  if ((deltas.expressionMusicalityScore ?? 0) >= 0.12 && recent.residualInstabilityComposite < 0.5) return "EXPRESSION_OPENING";
  if ((deltas.controlScore ?? 0) >= 0.12 && (deltas.stabilityScore ?? 0) >= 0.08) return "CONTROL_IMPROVING";
  if (input.recoveryScore >= 0.2 && recent.activationScore <= 0.58 && (energyLower || recent.energyScore <= 0.5)) return "RECOVERY_AFTER_PRESSURE";
  if (input.recoveryScore >= 0.16 && input.pressureEvidenceFamilies.length >= 2 && (energyLower || recent.energyScore <= 0.5)) return "PRESSURE_EASING";
  if ((deltas.continuityScore ?? 0) >= 0.12 && recent.residualInstabilityComposite < 0.54) return "VOICE_MORE_CONTINUOUS";
  if ((deltas.stabilityScore ?? 0) >= 0.12 && (deltas.continuityScore ?? 0) >= 0.08 && energyNormalOrHigher) return "MORE_CENTERED_THAN_RECENT";
  if ((deltas.activationScore ?? 0) <= -0.12 && (deltas.stabilityScore ?? 0) >= 0.08 && energyNormalOrHigher) return "CALMER_THAN_RECENT";
  if (pressureIsBuilding(input) && !tooStrongPressureFeedback) return "PRESSURE_BUILDING";
  if (pressureIsHolding(input) && !tooStrongPressureFeedback) return "PRESSURE_HOLDING_STEADY";
  if (recent.activationScore >= 0.68 && recent.continuityScore <= 0.36 && recent.residualInstabilityComposite >= 0.62) {
    return trends.continuityScore && trends.continuityScore > 0 ? "OVERLOAD_EASING" : "OVERLOAD_BUILDING";
  }
  if (recent.pitchMovementScore >= 0.68 && recent.continuityScore <= 0.44) return "BRACING_PATTERN";
  if (input.repeatedReadId && /WAITING|BRACED|ALERT/i.test(input.repeatedReadId)) return "ANTICIPATION_LOOP";
  if (recent.pitchMovementScore >= 0.72 && recent.stabilityScore <= 0.48) return "RESTLESS_PATTERN";
  if (input.dipScore >= 0.14 && recent.energyScore <= 0.42) return "ENERGY_DIPPING";
  if ((deltas.energyScore ?? 0) >= 0.12 && recent.residualInstabilityComposite >= 0.54) return "ENERGY_RISING_WITH_STRAIN";
  if (recent.energyScore <= 0.42 && recent.expressionMusicalityScore <= 0.42) return "MUTED_PATTERN";
  if (recent.residualInstabilityComposite >= 0.58 && recent.expressionMusicalityScore <= 0.48 && recent.controlScore >= 0.56) {
    return "HOLDING_BACK_PATTERN";
  }
  if (recent.residualInstabilityComposite >= 0.58 && recent.expressionMusicalityScore <= 0.52) return "EMOTIONAL_LOAD_REPEATING";
  if ((deltas.expressionMusicalityScore ?? 0) >= 0.12 && recent.residualInstabilityComposite >= 0.52) return "EXPRESSION_WITH_STRAIN";
  if ((deltas.controlScore ?? 0) <= -0.12 && recent.residualInstabilityComposite >= 0.54) return "CONTROL_DROPPING";
  if ((deltas.continuityScore ?? 0) >= 0.12) return "VOICE_MORE_CONTINUOUS";
  if ((deltas.continuityScore ?? 0) <= -0.12) return "VOICE_MORE_INTERRUPTED";
  if (isCloseToBaseline(recent)) return "STEADY_BASELINE_HOLDING";
  if ((deltas.activationScore ?? 0) <= -0.12 && (deltas.stabilityScore ?? 0) >= 0.08) return "CALMER_THAN_RECENT";
  if ((deltas.stabilityScore ?? 0) >= 0.12 && (deltas.continuityScore ?? 0) >= 0.08) return "MORE_CENTERED_THAN_RECENT";
  if (input.volatility >= 0.18) return "VOLATILE_PATTERN";
  if (input.mixedPatternScore >= 0.22) return "MIXED_BUT_STABLE";
  if (input.dipScore >= 0.12) return "DROP_AFTER_HIGH_ENERGY";
  return input.cleanRatio >= 0.75 ? "THREAD_UNCLEAR_GOOD_DATA" : "THREAD_UNCLEAR_WEAK_DATA";
}

function getThreadTemplate(analysis: Analysis): ThreadTemplate {
  const count = analysis.usable.length;
  const templates: Record<ThreadStateId, ThreadTemplate> = {
    BASELINE_ONE_CLEAN_POINT: {
      family: "baseline learning",
      title: "Baseline forming",
      headline: "One clean hum is in.",
      main: "Hum can read this moment, but it cannot tell what repeats yet.",
      whatChanged: "Not enough hums to compare change.",
      whatStayed: "Not enough hums to know what stays.",
      whatThisMayReflect: "This is not a pattern yet. It is the start of your personal reference.",
      whatToDo: "Keep the next hum simple and repeatable. Same posture, similar distance from the mic, and a clean 8 to 12 second hum.",
      chips: ["Baseline forming", "Not enough comparison yet", "Clean hums collected", "More data needed"],
      tone: "insufficient",
    },
    BASELINE_COLLECTING_RANGE: {
      family: "baseline learning",
      title: "Baseline forming",
      headline: "Hum is collecting your usual range.",
      main: `Hum has ${count} clean hums. That is enough for early hints, but not enough to call a real pattern.`,
      whatChanged: "Too early to call a real change.",
      whatStayed: "Too early to know what is repeating.",
      whatThisMayReflect: "If a similar state keeps showing up, Hum will start naming it after the baseline forms.",
      whatToDo: "Keep the next hum simple and repeatable. The cleaner the next few hums are, the more personal the thread becomes.",
      chips: ["Baseline forming", "Not enough comparison yet", "Clean hums collected", "More data needed"],
      tone: "insufficient",
    },
    BASELINE_READY_NEXT_HUM: {
      family: "baseline learning",
      title: "Baseline forming",
      headline: "One more clean hum unlocks your first baseline.",
      main: "Hum has 4 clean hums. The next usable hum should make your thread more personal.",
      whatChanged: "Still early, but the comparison is almost ready.",
      whatStayed: "The thread is about to start showing what repeats.",
      whatThisMayReflect: "This is the last step before Hum can compare against your starting pattern.",
      whatToDo: "Make the next hum clean and simple.",
      chips: ["Baseline forming", "Not enough comparison yet", "Clean hums collected", "More data needed"],
      tone: "insufficient",
    },
    FIRST_BASELINE_ACTIVE: {
      family: "baseline learning",
      title: "Early pattern",
      headline: "Your first baseline is active.",
      main: "Hum can now compare recent hums with your starting pattern. This is still early, but it is finally personal.",
      whatChanged: "Hum can now begin naming changes against your own range.",
      whatStayed: "Your first usual range is now available.",
      whatThisMayReflect: "This is an early baseline, not a strong pattern yet.",
      whatToDo: "Do not treat one result as the full story. Watch what repeats over the next few hums.",
      chips: ["Pattern forming", "Close to baseline", "Clean hums collected"],
      tone: "insufficient",
    },
    STEADY_BASELINE_HOLDING: simple("stable", "Growing thread", "Your recent hums are staying steady.", "Nothing is strongly spiking or dipping. Your recent voice pattern is staying close to your usual range.", "No major change stands out.", "Your energy, steadiness, and continuity are holding close to baseline.", "This looks like a stable check-in.", "Use this as a stable check-in. No big correction needed.", ["Close to baseline", "Stability improving"], "steady"),
    CALMER_THAN_RECENT: simple("recovery", "Early thread", "You are sounding calmer than recent hums.", "Your recent hum has less charge and more steadiness than the few before it.", "The charge is easing.", "Your voice is still clear enough to trust the comparison.", "This may be a short recovery window.", "Protect the quieter state. Do the important thing before the day gets noisy again.", ["Charge easing", "Stability improving", "Less vocal wobble"], "settling"),
    MORE_CENTERED_THAN_RECENT: simple("stable", "Early thread", "You are sounding more centered.", "Your voice is holding together more cleanly than the recent pattern.", "Steadiness and continuity improved.", "The useful energy is still there.", "This may reflect better access to attention and control.", "Use the cleaner state for one task that needs attention.", ["Stability improving", "Better continuity"], "steady"),
    PRESSURE_BUILDING: simple("pressure build-up", "Growing thread", "Pressure seems to be building.", "Your last few hums are carrying more charge, and they are not settling as easily.", "Charge is increasing across recent hums.", "You are still producing usable hums, so this looks like a real pattern rather than bad audio.", "This looks like a pressure pattern building.", "Close one recurring open loop before adding more input.", ["Charge rising", "More vocal wobble", "Stability dropping", "Pressure repeating"], "rising", "cautious"),
    PRESSURE_HOLDING_STEADY: simple("pressure build-up", "Growing thread", "Pressure is staying with you.", "This does not look like one spike. Your recent hums keep returning to a pressured but functional state.", "The pressure has not increased sharply, but it has not cleared either.", "Control is still present.", "This looks like a pressure pattern holding steady.", "Do not just push through. Remove one demand or make one thing smaller.", ["Pressure repeating", "Charge rising"], "rising", "cautious"),
    PRESSURE_EASING: simple("recovery", "Growing thread", "Pressure is easing, but energy is lower.", "Your recent hums look less pressured than the earlier ones. That is a good sign, but your energy is also lower, so this looks like recovery, not a full reset.", "The recent hums have less charge and less small wobble.", "Your voice is still clear enough to track, and the pattern is becoming easier to compare.", "You may be coming down from a heavier patch. The system is settling, but it may still be low on fuel.", "Do not immediately add more tasks just because you feel a bit steadier. Keep the next few hours lighter.", ["Charge easing", "Less vocal wobble", "Stability improving", "Energy dipping"], "settling"),
    STRESS_SPIKE_ONE_OFF: simple("stress spike", "Early thread", "This looks like a one-off spike.", "One hum jumped higher in charge, but the surrounding pattern does not yet show a build-up.", "One recent hum stood out.", "The pattern around it is not consistently high-pressure.", "This is probably a one-off spike.", "Check what happened around that hum. If the next one settles, keep tracking before making a big interpretation.", ["One-off spike", "Charge rising"], "volatile", "soft"),
    STRESS_SPIKE_REPEATING: simple("stress spike", "Growing thread", "Stress-like spikes are repeating.", "More than one recent hum has jumped above your usual charge range.", "The spikes are no longer isolated.", "The pattern still has enough clean signal to track.", "This may be a stress-like pattern repeating.", "Treat this as a warning light. Lower input before the next demand.", ["Charge rising", "Pressure repeating"], "volatile", "cautious"),
    BRACING_PATTERN: simple("anxiety-like recurrence", "Growing thread", "A bracing pattern is showing up.", "Your recent hums keep showing alert, searching energy rather than a fully landed state.", "The braced quality is repeating.", "The voice remains readable, so Hum can track the pattern.", "This may be an anxiety-like pattern, not a diagnosis.", "Do not chase certainty. Pick one predictable cue: water, feet on floor, longer exhale, familiar track.", ["Pressure repeating", "Lower continuity"], "tightening", "cautious"),
    ANTICIPATION_LOOP: simple("anxiety-like recurrence", "Growing thread", "You may be stuck in waiting mode.", "Recent hums suggest readiness without release, like part of you is preparing for something to resolve.", "The waiting quality is repeating.", "Energy is present, but it is not landing cleanly.", "This may reflect anticipation or unresolved input.", "Start one thing that does not depend on anyone else.", ["Pressure repeating", "Pattern forming"], "tightening", "soft"),
    RESTLESS_PATTERN: simple("anxiety-like recurrence", "Growing thread", "Restlessness is repeating.", "Your recent hums keep moving instead of landing in a stable phrase.", "Movement and interruptions are showing up repeatedly.", "There is still energy to work with.", "This looks like repeating restlessness.", "Give the energy one container. One small finish, one timer, one task.", ["Charge rising", "More brief breaks", "Stability dropping"], "volatile", "soft"),
    OVERLOAD_BUILDING: simple("overload", "Growing thread", "Overload may be building.", "Your recent hums are getting less continuous and more unstable.", "Breaks, wobble, or unevenness are increasing.", "The captures are still usable enough to compare.", "This may be an overload pattern building.", "Stop adding input. Close one loop before starting another.", ["More brief breaks", "More vocal wobble", "Lower continuity"], "tightening", "cautious"),
    OVERLOAD_EASING: simple("recovery", "Growing thread", "The overload pattern is easing.", "Your voice is becoming more continuous again after a more interrupted stretch.", "Continuity improved.", "Some charge may still be present.", "This looks like recovery from overload.", "Keep the next step small so the system keeps settling.", ["Better continuity", "Fewer breaks"], "settling"),
    ENERGY_RISING_CLEANLY: simple("stable", "Growing thread", "Energy is rising cleanly.", "Recent hums have more lift without extra instability.", "Energy increased.", "Control stayed present.", "This looks like useful energy returning.", "Use the energy while it is clean. Pick one clear task.", ["Energy returning", "Stability improving"], "rising"),
    ENERGY_RISING_WITH_STRAIN: simple("expression shift", "Growing thread", "Energy is up, but strain came with it.", "Recent hums have more lift, but also more wobble or unevenness.", "Energy and unevenness rose together.", "The signal is still readable.", "This may be effortful energy rather than easy energy.", "Use the energy gently. Do not force a big push from it.", ["Energy returning", "More vocal wobble"], "rising", "soft"),
    ENERGY_DIPPING: simple("energy dip", "Growing thread", "Your energy is dipping.", "Recent hums carry less lift, color, and expression than earlier ones.", "Energy, brightness, or expression dropped.", "The lower-energy signal is repeating enough to notice.", "This looks like an energy dip.", "Lower the bar for the next task and add one recovery cue.", ["Energy dipping", "More muted"], "low_energy", "soft"),
    LOW_RECOVERY_PATTERN: simple("low-recovery", "Growing thread", "Low recovery is repeating.", "Recent hums look under-recovered across more than one marker.", "Recovery markers are lower than earlier.", "The low-recovery signal is repeating.", "This may be an under-recovered pattern.", "Choose maintenance before intensity.", ["Low recovery repeating", "Energy dipping"], "low_energy", "soft"),
    WIRED_TIRED_REPEATING: simple("low-recovery", "Growing thread", "Wired but tired is repeating.", "Your recent hums carry charge, but not much recovery underneath it.", "Charge is staying high while recovery looks low.", "You are still functioning enough to produce usable hums.", "This may be an under-recovered pressure pattern.", "Do not chase more stimulation. Stabilize first.", ["Low recovery repeating", "Pressure repeating"], "tightening", "cautious"),
    SLEEP_DEPRIVED_LIKE_PATTERN: simple("low-recovery", "Growing thread", "Your recent hums look sleep-deprived-like.", "This is not a sleep diagnosis, but the pattern looks under-recovered across recent hums.", "Energy, clarity, and continuity are lower than your usual.", "The low-recovery markers are repeating.", "This may fit poor sleep if your real-life context matches it.", "Delay non-urgent decisions and protect tonight's sleep.", ["Low recovery repeating", "Energy dipping"], "low_energy", "cautious", "This is not a sleep diagnosis."),
    MUTED_PATTERN: simple("low-mood-like", "Growing thread", "You have been sounding more muted.", "Recent hums have less lift, less color, and less expression than your usual.", "Expression and energy are lower.", "The muted quality is repeating.", "This may be low fuel or lower emotional lift.", "Create one small physical shift before waiting for motivation.", ["More muted", "Energy dipping"], "low_energy", "soft"),
    LOW_MOOD_LIKE_PATTERN: simple("low-mood-like", "Growing thread", "A low-mood-like pattern may be forming.", "Your recent hums are showing lower energy and flatter expression than your usual.", "Lower lift is repeating.", "The pattern is not just one hum.", "This may be a low-mood-like pattern, not a diagnosis.", "Do one body action and one contact action. Move a little and message someone safe.", ["More muted", "Energy dipping", "Pattern forming"], "low_energy", "cautious", "This is not a diagnosis."),
    DEPRESSION_LIKE_HEAVINESS_PATTERN: simple("low-mood-like", "Strong thread", "A heavier low-mood pattern is repeating.", "Your recent hums show lower energy, flatter expression, and less vocal lift than your baseline. This is not a diagnosis, but it is worth paying attention to if it matches how you feel.", "The heaviness is repeating across hums.", "The low-lift pattern has not cleared yet.", "This may be a heavier low-mood-like pattern.", "Do not handle this alone if it matches your real life. Tell someone safe and consider professional support if this has been lasting.", ["More muted", "Low recovery repeating", "Pattern forming"], "low_energy", "sustained", "This is not a diagnosis."),
    EMOTIONAL_LOAD_REPEATING: simple("emotional load", "Growing thread", "Emotional load is repeating.", "Recent hums suggest something is being carried under the surface.", "The emotional load is showing up more than once.", "You are still keeping control on the surface.", "This may be an emotional load pattern.", "Name the load before acting from it.", ["More vocal wobble", "Pattern forming"], "tightening", "soft"),
    HOLDING_BACK_PATTERN: simple("emotional load", "Growing thread", "You may be holding something back.", "Recent hums are controlled, but the expression stays constrained while tension remains underneath.", "The guarded quality is repeating.", "Control is still strong.", "This may be a held-back emotional load pattern.", "Write the unsaid sentence privately before deciding what to do with it.", ["More vocal wobble", "More muted"], "tightening", "soft"),
    EXPRESSION_OPENING: simple("expression shift", "Growing thread", "Expression is opening up.", "Recent hums show more musical movement and expression without extra instability.", "Expression increased.", "The movement still looks controlled.", "This looks like expression opening.", "Use this for music, writing, conversation, or something creative.", ["More expressive", "Stability improving"], "opening"),
    EXPRESSION_WITH_STRAIN: simple("expression shift", "Growing thread", "Expression is up, but strain came with it.", "Recent hums have more movement, but not all of it looks easy or controlled.", "Expression and instability rose together.", "The signal is still readable.", "This may be emotion moving with some strain.", "Let the feeling move, but do not force a big emotional conclusion.", ["More expressive", "More vocal wobble"], "opening", "soft"),
    CONTROL_IMPROVING: simple("stable", "Growing thread", "Control is improving.", "Your recent hums are holding together more cleanly than earlier ones.", "Control and continuity improved.", "The voice remains present.", "This looks like steadier control returning.", "Use the steadier state for one practical next step.", ["Stability improving", "Better continuity"], "steady"),
    CONTROL_DROPPING: simple("volatility", "Growing thread", "Control is dropping a little.", "Recent hums are less held together than earlier ones.", "More wobble, breaks, or unevenness are showing up.", "The hums are still usable enough to track.", "This may be a control drop worth noticing early.", "Reduce demands before the pattern gets louder.", ["Stability dropping", "More vocal wobble"], "tightening", "soft"),
    VOICE_MORE_CONTINUOUS: simple("recovery", "Growing thread", "Your voice is becoming more continuous.", "Recent hums have fewer interruptions and hold the phrase more cleanly.", "Continuity improved.", "The signal remains usable.", "This looks like smoother flow returning.", "Keep the setup repeatable. The cleaner thread is useful.", ["Better continuity", "Fewer breaks"], "settling"),
    VOICE_MORE_INTERRUPTED: simple("volatility", "Growing thread", "Your voice is more interrupted lately.", "Recent hums have more breaks or pauses than earlier ones.", "Continuity dropped.", "The pattern is still readable if capture quality is good.", "This may reflect fatigue, interruptions, or rising load.", "Check breath, fatigue, and interruptions before the next hum.", ["More brief breaks", "Lower continuity"], "tightening", "soft"),
    VOLATILE_PATTERN: simple("volatility", "Growing thread", "Your pattern is jumpy right now.", "Recent hums are moving in different directions instead of forming one clear trend.", "The state is changing from hum to hum.", "The variability itself is the pattern.", "This is a volatile pattern, so one hum should not carry the whole story.", "Do not force one explanation from one hum. Look for what repeats over the next two.", ["Pattern forming"], "volatile", "soft"),
    MIXED_BUT_STABLE: simple("mixed", "Growing thread", "Mixed, but stable.", "Different parts of the signal point in different directions, but the overall pattern is not swinging wildly.", "No single change dominates.", "The mixed quality is staying fairly steady.", "This is a normal middle zone unless one part starts repeating strongly.", "Treat this as a normal middle zone unless one part starts repeating strongly.", ["Pattern forming", "Close to baseline"], "volatile"),
    RECOVERY_AFTER_PRESSURE: simple("recovery", "Growing thread", "Pressure is easing, but energy is lower.", "Your recent hums look less pressured than the earlier ones. That is a good sign, but your energy is also lower, so this looks like recovery, not a full reset.", "The recent hums have less charge and less small wobble.", "Your voice is still clear enough to track, and the pattern is becoming easier to compare.", "You may be coming down from a heavier patch. The system is settling, but it may still be low on fuel.", "Do not immediately add more tasks just because you feel a bit steadier. Keep the next few hours lighter.", ["Charge easing", "Less vocal wobble", "Stability improving", "Energy dipping"], "settling"),
    DROP_AFTER_HIGH_ENERGY: simple("energy dip", "Growing thread", "There is a drop after high energy.", "After a more charged or energized patch, recent hums have less lift.", "Energy dropped.", "The earlier charge may have cost something.", "This may be recovery time after higher output.", "Treat this like recovery time, not failure.", ["Energy dipping", "Pattern forming"], "low_energy", "soft"),
    THREAD_UNCLEAR_GOOD_DATA: simple("unclear", "Growing thread", "No strong thread yet.", "The hums are clean enough, but they do not point to one clear direction right now.", "No major shift stands out.", "Your recent hums are close enough to avoid a strong claim.", "The absence of a strong pattern is still information.", "Keep logging. A clearer pattern may appear after the next few clean hums.", ["Close to baseline"], "insufficient"),
    THREAD_UNCLEAR_WEAK_DATA: simple("unclear", "Growing thread", "Thread needs cleaner data.", "Hum has some entries, but the captures are not consistent enough to make a fair longitudinal read.", "Not enough reliable comparison.", "The thread is still forming.", "This is more about data quality than inner state.", "Use a similar setup for the next few hums.", ["Not enough shared data", "More data needed"], "insufficient"),
  };

  return templates[analysis.stateId];
}

function simple(
  family: ThreadFamily,
  title: string,
  headline: string,
  main: string,
  whatChanged: string,
  whatStayed: string,
  whatThisMayReflect: string,
  whatToDo: string,
  chips: string[],
  tone: ThreadPatternTone,
  concernLevel: ThreadInsight["concernLevel"] = "none",
  guardrailNote?: string,
): ThreadTemplate {
  return { family, title, headline, main, whatChanged, whatStayed, whatThisMayReflect, whatToDo, chips, tone, concernLevel, guardrailNote };
}

function toThreadPoint(session: HumSession): ThreadPoint {
  return {
    session,
    dimensions: scoreDimensions(session),
    readId: getSessionReadId(session),
    readFamily: getSessionReadFamily(session),
  };
}

function scoreDimensions(session: HumSession): ThreadDimensions {
  const features = session.features;
  const scores = session.dimensionScores;
  if (!features) return emptyDimensions;
  const z = session.baselineComparison?.zScores ?? {};
  const baselineEnergy = average([
    normalizeSigned(z.inputRms ?? 0),
    normalizeSigned(z.meanRms ?? 0),
    normalizeSigned(z.rmsEnergy ?? 0),
  ]);
  const baselinePitchMovement = average([normalizeSigned(z.pitchRange ?? 0), normalizeSigned(z.pitchVariance ?? 0), normalizeSigned(z.pitchDrift ?? 0)]);
  const baselineStabilityPressure = average([
    normalizeSigned(z.pitchVariance ?? 0),
    normalizeSigned(z.jitter ?? 0),
    normalizeSigned(z.breakCount ?? 0),
    normalizeSigned(z.pauseCount ?? 0),
  ]);
  const rawEnergyScore = average([
    normalize(features.inputRms || features.meanRms || features.rmsEnergy, 0.006, 0.065),
    normalize(features.meanRms, 0.006, 0.055),
    normalize(features.peakAmplitude, 0.04, 0.55),
    normalize(features.activeFrameRatio, 0.45, 0.9),
  ]);
  const energyScore = scores ? normalizeSigned(scores.activationScore) : Math.max(rawEnergyScore, baselineEnergy);
  const rawPitchMovementScore = average([
    normalize(features.pitchRange, 1.5, 12),
    normalize(features.pitchVariance, 0.2, 1600),
    normalize(abs(features.pitchDrift), 0.02, 0.35),
    normalize(features.noteChangeRate, 0.08, 1.2),
  ]);
  const pitchMovementScore = Math.max(rawPitchMovementScore, baselinePitchMovement);
  const residualInstabilityComposite = average([
    normalize(features.residualInstabilityScore, 0.12, 0.72),
    normalize(features.residualPitchInstability, 0.12, 0.74),
    normalize(features.residualAmplitudeInstability, 0.12, 0.72),
    normalize(features.jitter, 0.01, 0.07),
    normalize(features.shimmerProxy, 0.02, 0.18),
    baselineStabilityPressure,
  ]);
  const rawStabilityScore = average([
    inverseNormalize(features.pitchStability, 0.02, 0.16),
    inverseNormalize(features.amplitudeStability, 0.015, 0.16),
    normalize(features.longestStableSegment, 2, 10),
    normalize(features.stableSegmentCoverage, 0.35, 0.9),
    inverseNormalize(residualInstabilityComposite, 0.25, 0.72),
  ]);
  const stabilityScore = scores ? normalizeSigned(scores.stabilityScore) : Math.min(rawStabilityScore, 1 - Math.max(0, baselineStabilityPressure - 0.5));
  const continuityScore = scores ? normalizeSigned(scores.continuityScore) : average([
    normalize(features.voicingContinuityCoverage, 0.35, 0.9),
    normalize(features.phraseContinuityCoverage, 0.25, 0.9),
    normalize(features.pitchStableSegmentCoverage, 0.35, 0.9),
    inverseNormalize(features.breakCount, 0, 5),
    inverseNormalize(features.pauseCount, 0, 5),
    inverseNormalize(features.microBreakRatio, 0.02, 0.16),
  ]);
  const volumeControlScore = average([
    inverseNormalize(features.amplitudeStability, 0.015, 0.16),
    inverseNormalize(features.shimmerProxy, 0.02, 0.18),
    normalize(features.controlledExpressionScore, 0.2, 0.82),
    normalize(features.meanRms, 0.006, 0.055),
  ]);
  const expressionMusicalityScore = average([
    normalize(features.musicalityScore, 0.18, 0.86),
    normalize(features.controlledExpressionScore, 0.18, 0.86),
    normalize(features.phraseContourScore, 0.2, 0.82),
    normalize(features.melodicSmoothness, 0.25, 0.85),
    normalize(features.pitchRange, 1.5, 10),
  ]);
  const cleanlinessConfidenceScore = average([
    normalize(features.clarityScore, 0.25, 0.9),
    normalize(features.signalToNoiseProxy, 2, 20),
    inverseNormalize(features.silenceRatio, 0.05, 0.45),
    inverseNormalize(features.clippedFrameRatio, 0, 0.12),
  ]);
  const captureQualityScore = average([
    normalize(features.duration, 5, 12),
    normalize(features.pitchCoverage, 0.4, 0.9),
    normalize(features.activeFrameRatio, 0.42, 0.9),
    inverseNormalize(features.quietFrameRatio, 0.08, 0.55),
    cleanlinessConfidenceScore,
  ]);
  const fatigueRecoveryScore = average([
    inverseNormalize(energyScore, 0.22, 0.68),
    normalize(features.breathinessProxy, 0.14, 0.62),
    inverseNormalize(continuityScore, 0.34, 0.8),
    inverseNormalize(cleanlinessConfidenceScore, 0.42, 0.85),
  ]);
  const toneColorScore = average([
    normalize(features.spectralCentroid, 350, 1400),
    normalize(features.spectralRolloff, 600, 2600),
    normalize(features.spectralBandwidth, 90, 900),
    inverseNormalize(features.spectralFlatness, 0.08, 0.5),
  ]);
  const moodHeavinessScore = average([
    inverseNormalize(energyScore, 0.2, 0.62),
    inverseNormalize(expressionMusicalityScore, 0.22, 0.68),
    inverseNormalize(toneColorScore, 0.25, 0.62),
    normalize(features.quietFrameRatio, 0.08, 0.45),
  ]);
  const controlScore = scores ? normalizeSigned(scores.controlScore) : average([volumeControlScore, stabilityScore, continuityScore]);
  const activationScore = average([energyScore, pitchMovementScore, residualInstabilityComposite]);

  return {
    captureQualityScore,
    cleanlinessConfidenceScore,
    energyScore,
    volumeControlScore,
    pitchMovementScore,
    stabilityScore,
    expressionMusicalityScore,
    residualInstabilityComposite,
    continuityScore,
    fatigueRecoveryScore,
    moodHeavinessScore,
    toneColorScore,
    activationScore,
    controlScore,
  };
}

function splitWindows(points: ThreadPoint[]) {
  const count = points.length;
  if (count <= 1) return { earlier: [] as ThreadPoint[], recent: points };
  if (count < 5) {
    const recentCount = Math.min(2, count - 1);
    return { earlier: points.slice(0, count - recentCount), recent: points.slice(count - recentCount) };
  }
  if (count <= 9) {
    const recentCount = Math.min(3, Math.max(2, Math.ceil(count / 3)));
    return { earlier: points.slice(0, count - recentCount), recent: points.slice(count - recentCount) };
  }
  if (count <= 19) {
    const recentCount = Math.min(5, Math.max(3, Math.ceil(count / 4)));
    return { earlier: points.slice(Math.max(0, count - recentCount - 10), count - recentCount), recent: points.slice(count - recentCount) };
  }
  const recentCount = Math.min(7, Math.max(5, Math.ceil(count / 5)));
  return { earlier: points.slice(0, count - recentCount), recent: points.slice(count - recentCount) };
}

function getWindowStats(points: ThreadPoint[]): WindowStats {
  const median = { ...emptyDimensions };
  for (const key of dimensionKeys) {
    median[key] = getMedian(points.map((point) => point.dimensions[key]));
  }
  return { count: points.length, median };
}

function subtractDimensions(recent: ThreadDimensions, earlier: ThreadDimensions) {
  const out: Partial<Record<DimensionKey, number>> = {};
  for (const key of dimensionKeys) out[key] = recent[key] - earlier[key];
  return out;
}

function getTrends(points: ThreadPoint[]) {
  const out: Partial<Record<DimensionKey, number>> = {};
  if (points.length < 5) return out;
  for (const key of dimensionKeys) out[key] = slope(points.map((point) => point.dimensions[key]));
  return out;
}

function pressureIsBuilding(input: {
  recentStats: WindowStats;
  deltas: Partial<Record<DimensionKey, number>>;
  trends: Partial<Record<DimensionKey, number>>;
  pressureEvidenceFamilies: string[];
  buildUpScore: number;
}) {
  return (
    input.recentStats.median.activationScore >= 0.6 &&
    input.pressureEvidenceFamilies.length >= 3 &&
    ((input.deltas.activationScore ?? 0) >= 0.08 || (input.trends.activationScore ?? 0) >= 0.025 || input.buildUpScore >= 0.08)
  );
}

function pressureIsHolding(input: {
  recentStats: WindowStats;
  repeatedReadId: string | null;
  repeatedReadCount: number;
  pressureEvidenceFamilies: string[];
}) {
  return (
    input.recentStats.median.activationScore >= 0.62 &&
    input.recentStats.median.controlScore >= 0.5 &&
    input.pressureEvidenceFamilies.length >= 3 &&
    (input.repeatedReadCount >= 2 || /PRESSURE|ALERT|COMPOSED/i.test(input.repeatedReadId ?? ""))
  );
}

function getPressureEvidenceFamilies(
  recent: WindowStats,
  earlier: WindowStats,
  deltas: Partial<Record<DimensionKey, number>>,
  stage: ThreadStage,
) {
  if (stage === "BASELINE_LEARNING_1" || stage === "BASELINE_LEARNING_2_TO_4" || stage === "EARLY_BASELINE_5") return [];
  const families: string[] = [];
  if (recent.median.captureQualityScore >= 0.48) families.push("capture usable");
  if (recent.median.activationScore >= 0.6 || (deltas.activationScore ?? 0) >= 0.1) families.push("activation high");
  if (recent.median.residualInstabilityComposite >= 0.54 || (deltas.residualInstabilityComposite ?? 0) >= 0.08) {
    families.push("residual instability high");
  }
  if (recent.median.stabilityScore <= 0.5 || recent.median.stabilityScore < earlier.median.stabilityScore - 0.08) {
    families.push("stability lower");
  }
  if (!(recent.median.expressionMusicalityScore >= 0.68 && recent.median.controlScore >= 0.58 && recent.median.residualInstabilityComposite < 0.5)) {
    families.push("musicality protection clear");
  }
  return families;
}

function hasLowMoodPattern(points: ThreadPoint[], required: number) {
  const postBaseline = points.slice(5);
  if (postBaseline.length < required) return false;
  return postBaseline.filter((point) => point.dimensions.moodHeavinessScore >= 0.64 && point.dimensions.energyScore <= 0.44).length >= required;
}

function hasSleepDeprivedPattern(points: ThreadPoint[]) {
  const recent = points.slice(-5);
  const repeatedLowRecovery = recent.filter((point) => point.dimensions.fatigueRecoveryScore >= 0.68 && point.dimensions.energyScore <= 0.45).length >= 2;
  const context = recent.some((point) => [...(point.session.stateReasons ?? []), ...(point.session.captureReasons ?? [])].some((reason) => /sleep|morning|tired/i.test(reason)));
  return repeatedLowRecovery && context;
}

function countRecentSpikes(points: ThreadPoint[]) {
  const recent = points.slice(-5);
  let count = 0;
  for (let index = 0; index < recent.length; index += 1) {
    const point = recent[index];
    const previous = recent[index - 1] ?? points[points.length - recent.length + index - 1];
    const isolated = !previous || previous.dimensions.activationScore < 0.58;
    if (isolated && point.dimensions.activationScore >= 0.64 && point.dimensions.residualInstabilityComposite >= 0.55) count += 1;
  }
  return count;
}

function getOneOffSpikeScore(points: ThreadPoint[]) {
  if (points.length < 6) return 0;
  const latest = points[points.length - 1];
  const earlier = points.slice(0, -1);
  const earlierActivation = getMedian(earlier.map((point) => point.dimensions.activationScore));
  const latestActivation = latest.dimensions.activationScore;
  const earlierStable = getVolatility(earlier.slice(-5)) <= 0.12;
  return earlierStable && latestActivation >= 0.64 && latestActivation - earlierActivation >= 0.18 ? latestActivation - earlierActivation + 0.5 : 0;
}

function getVolatility(points: ThreadPoint[]) {
  if (points.length <= 1) return 0;
  const keys: DimensionKey[] = ["activationScore", "energyScore", "stabilityScore", "continuityScore", "residualInstabilityComposite"];
  return average(keys.map((key) => standardDeviation(points.map((point) => point.dimensions[key]))));
}

function getMixedPatternScore(deltas: Partial<Record<DimensionKey, number>>, volatility: number) {
  const values = ["activationScore", "energyScore", "stabilityScore", "continuityScore", "expressionMusicalityScore"].map(
    (key) => deltas[key as DimensionKey] ?? 0,
  );
  const positive = values.filter((value) => value >= 0.1).length;
  const negative = values.filter((value) => value <= -0.1).length;
  return positive && negative ? Math.min(0.5, average(values.map(Math.abs)) + volatility) : 0;
}

function isCloseToBaseline(dimensions: ThreadDimensions) {
  return (
    Math.abs(dimensions.activationScore - 0.5) <= 0.12 &&
    Math.abs(dimensions.energyScore - 0.5) <= 0.15 &&
    dimensions.stabilityScore >= 0.48 &&
    dimensions.continuityScore >= 0.48
  );
}

function buildEvidenceChips(analysis: Analysis, template: ThreadTemplate) {
  const chips = [...template.chips];
  const deltas = analysis.deltas;
  if ((deltas.activationScore ?? 0) >= 0.1) chips.push("Charge rising");
  if ((deltas.activationScore ?? 0) <= -0.1) chips.push("Charge easing");
  if ((deltas.energyScore ?? 0) <= -0.1) chips.push("Energy dipping");
  if ((deltas.energyScore ?? 0) >= 0.1) chips.push("Energy returning");
  if ((deltas.stabilityScore ?? 0) >= 0.1) chips.push("Stability improving");
  if ((deltas.stabilityScore ?? 0) <= -0.1) chips.push("Stability dropping");
  if ((deltas.residualInstabilityComposite ?? 0) >= 0.1) chips.push("More vocal wobble");
  if ((deltas.residualInstabilityComposite ?? 0) <= -0.1) chips.push("Less vocal wobble");
  if ((deltas.continuityScore ?? 0) <= -0.1) chips.push("Lower continuity");
  if ((deltas.continuityScore ?? 0) >= 0.1) chips.push("Better continuity");
  if (analysis.repeatedReadCount >= 3) chips.push("Pattern forming");
  return unique(chips).slice(0, 5);
}

function toBehaviorSignals(chips: string[], analysis: Analysis): ThreadBehaviorSignal[] {
  return chips.slice(0, 3).map((chip, index) => ({
    id: `${analysis.stateId}:${chip}`,
    axis: chipToAxis(chip),
    label: chip,
    sentence: chip,
    detail: "Built from the saved hum comparison.",
    window: index === 0 ? "recent" : "today",
    tone: chipToTone(chip),
    sourceKeys: chipToSourceKeys(chip),
  }));
}

function chipToAxis(chip: string): ThreadBehaviorSignal["axis"] {
  if (/energy|muted|recovery/i.test(chip)) return "energy";
  if (/continuity|break/i.test(chip)) return "continuity";
  if (/stability|wobble/i.test(chip)) return "steadiness";
  if (/expressive/i.test(chip)) return "movement";
  if (/baseline|data/i.test(chip)) return "recording";
  return "shape";
}

function chipToTone(chip: string): ThreadBehaviorSignal["tone"] {
  if (/easing|improving|better|fewer|returning|baseline/i.test(chip)) return "steadier";
  if (/rising|pressure/i.test(chip)) return "stronger";
  if (/dipping|muted/i.test(chip)) return "contained";
  if (/break|continuity/i.test(chip)) return "broken";
  if (/wobble|dropping|spike/i.test(chip)) return "uneven";
  if (/expressive/i.test(chip)) return "movement";
  return "controlled";
}

function chipToSourceKeys(chip: string): Array<keyof AudioFeatures> {
  if (/energy/i.test(chip)) return ["inputRms", "meanRms", "rmsEnergy"];
  if (/wobble|stability/i.test(chip)) return ["residualInstabilityScore", "pitchStability"];
  if (/continuity|break/i.test(chip)) return ["phraseContinuityCoverage", "breakCount"];
  if (/muted|expressive/i.test(chip)) return ["musicalityScore", "spectralCentroid"];
  return ["clarityScore"];
}

function buildPhaseLabels(analysis: Analysis): NonNullable<ThreadInsight["phaseLabels"]> {
  return {
    earlier: [analysis.earlier.length ? "Earlier hums" : "Not enough earlier hums", `${analysis.earlier.length} usable ${plural(analysis.earlier.length, "hum")}`],
    recent: [analysis.recent.length === 1 ? "Today's hum" : "Recent hums", `${analysis.recent.length} usable ${plural(analysis.recent.length, "hum")}`],
  };
}

function buildStageScores(analysis: Analysis): ThreadStageScores {
  return {
    earlier: toStageScore(analysis.earlierStats.median),
    middle: toStageScore(getWindowStats(analysis.usable.slice(Math.floor(analysis.usable.length / 3), Math.ceil((analysis.usable.length * 2) / 3))).median),
    recent: toStageScore(analysis.recentStats.median),
  };
}

function toStageScore(dimensions: ThreadDimensions) {
  return {
    openness: dimensions.expressionMusicalityScore,
    steadiness: dimensions.stabilityScore,
    lift: dimensions.toneColorScore,
    energy: dimensions.activationScore,
    movement: dimensions.pitchMovementScore,
    smoothness: dimensions.stabilityScore,
    continuity: dimensions.continuityScore,
    clarity: dimensions.cleanlinessConfidenceScore,
    interruption: 1 - dimensions.continuityScore,
    baselineCloseness: 1 - Math.abs(dimensions.activationScore - 0.5),
    inwardness: dimensions.moodHeavinessScore,
    restlessness: dimensions.residualInstabilityComposite,
    landingSlowness: dimensions.fatigueRecoveryScore,
    flatness: dimensions.moodHeavinessScore,
  };
}

function getComparisonSummary(analysis: Analysis) {
  if (analysis.usable.length === 1) return "Not enough earlier hums.";
  if (analysis.usable.length < 5) return "Recent and earlier hums do not have enough shared history for a strong comparison yet.";
  if (analysis.stateId === "THREAD_UNCLEAR_WEAK_DATA") return "The captures are not consistent enough for a fair comparison yet.";
  if (analysis.stateId === "THREAD_UNCLEAR_GOOD_DATA") return "The comparison is clean, but no strong direction stands out.";
  return `${getWindowSummary(analysis.earlierStats, analysis.stage, "earlier")} ${getWindowSummary(analysis.recentStats, analysis.stage, "recent")}`;
}

function getWindowSummary(stats: WindowStats, stage: ThreadStage, label: "earlier" | "recent") {
  if (!stats.count) return label === "earlier" ? "Not enough earlier hums." : "No recent hums yet.";
  if (stage === "BASELINE_LEARNING_1") return "Today's hum is the first clean point.";
  const dim = stats.median;
  if (dim.activationScore >= 0.64 && dim.stabilityScore <= 0.5) return `${capitalize(label)} hums carry more charge and less steadiness.`;
  if (dim.energyScore <= 0.42) return `${capitalize(label)} hums are lower in energy.`;
  if (dim.continuityScore <= 0.42) return `${capitalize(label)} hums are more interrupted.`;
  if (isCloseToBaseline(dim)) return `${capitalize(label)} hums are close to baseline.`;
  return `${capitalize(label)} hums are usable for comparison.`;
}

function getFeedbackLine(feedback: ThreadInsightDebug["readFeedbackInfluence"]) {
  if (feedback.tooStrongCount >= 2) return "Recent feedback suggests Hum may have been reading this pattern too strongly.";
  if (feedback.fitsCount >= 2) return "This has matched your feedback before.";
  if (feedback.tooSoftCount >= 2) return "Recent feedback says this may need a more direct read.";
  return "";
}

function getRepeatedReadLine(analysis: Analysis) {
  if (analysis.repeatedReadCount < 3) return "";
  return "This state has repeated across recent hums. If it does not feel right, mark it as Not quite so Hum can soften this pattern.";
}

function getEligibilityReason(analysis: Analysis, interpretation: HumInsightInterpretation) {
  if (analysis.usable.length < 5) return "Hum does not have enough shared data yet.";
  if (analysis.stateId === "THREAD_UNCLEAR_WEAK_DATA") return "Capture consistency is too low for a stronger thread.";
  return interpretation.patternReason;
}

function toInsightSection(section: InsightComparisonSection) {
  return {
    changed: section.changed.map(toCompactComparison),
    stable: section.stable.map(toCompactComparison),
    emptyReason: section.emptyReason,
  };
}

function toCompactComparison(entry: InsightComparisonSection["all"][number]) {
  return {
    key: entry.key,
    label: entry.label,
    meaning: entry.meaning,
    technicalLabel: entry.technicalLabel,
    direction: entry.direction,
    comparisonLabel: entry.comparisonLabel,
    evidence: entry.evidence,
    debugEvidence: entry.debugEvidence,
    basis: entry.basis,
    currentValue: entry.currentValue,
    usualValue: entry.usualValue,
    zScore: entry.zScore,
    ratio: entry.ratio,
    delta: entry.delta,
    earlierAverage: entry.earlierAverage,
    recentAverage: entry.recentAverage,
    earlierCount: entry.earlierCount,
    recentCount: entry.recentCount,
    repeatedRecentCount: entry.repeatedRecentCount,
  };
}

function getThreadStage(count: number): ThreadStage {
  if (count <= 1) return "BASELINE_LEARNING_1";
  if (count < 5) return "BASELINE_LEARNING_2_TO_4";
  if (count === 5) return "EARLY_BASELINE_5";
  if (count < 10) return "EARLY_BASELINE_6_TO_9";
  if (count < 20) return "GROWING_BASELINE_10_TO_19";
  return "STRONG_BASELINE_20_PLUS";
}

function getStageMetaLabel(stage: ThreadStage) {
  const labels: Record<ThreadStage, string> = {
    BASELINE_LEARNING_1: "Baseline learning",
    BASELINE_LEARNING_2_TO_4: "Baseline learning",
    EARLY_BASELINE_5: "Early baseline",
    EARLY_BASELINE_6_TO_9: "Early thread",
    GROWING_BASELINE_10_TO_19: "Growing thread",
    STRONG_BASELINE_20_PLUS: "Strong thread",
  };
  return labels[stage];
}

function getConfidenceLabel(stage: ThreadStage) {
  const labels: Record<ThreadStage, string> = {
    BASELINE_LEARNING_1: "Baseline learning",
    BASELINE_LEARNING_2_TO_4: "Baseline learning",
    EARLY_BASELINE_5: "Early pattern",
    EARLY_BASELINE_6_TO_9: "Early thread",
    GROWING_BASELINE_10_TO_19: "Growing thread",
    STRONG_BASELINE_20_PLUS: "Strong thread",
  };
  return labels[stage];
}

function getWindowLabel(analysis: Analysis) {
  if (analysis.usable.length < 5) return `${analysis.daysCovered || 0} ${plural(analysis.daysCovered || 0, "day")}`;
  return `${analysis.earlier.length} earlier, ${analysis.recent.length} recent`;
}

function getWindowPartLabel(label: string, count: number) {
  return `${label} · ${count} usable ${plural(count, "hum")}`;
}

function getPatternStrength(analysis: Analysis) {
  if (analysis.usable.length < 5) return 0;
  return round(clamp(Math.max(...Object.values(analysis.deltas).map((value) => Math.abs(value ?? 0)), analysis.volatility) * 2, 0, 1));
}

function getConfidence(analysis: Analysis) {
  const stageBase = analysis.usable.length < 5 ? 0.36 : analysis.usable.length < 10 ? 0.56 : analysis.usable.length < 20 ? 0.68 : 0.78;
  const feedback = analysis.feedbackInfluence.fitsCount * 0.02 - analysis.feedbackInfluence.tooStrongCount * 0.03 - analysis.feedbackInfluence.notQuiteCount * 0.03;
  const data = analysis.cleanRatio * 0.12 + Math.min(0.08, analysis.recent.length * 0.015);
  return round(clamp(stageBase + data + feedback, 0.22, 0.9));
}

function getTopDeltas(analysis: Analysis) {
  return Object.entries(analysis.deltas)
    .map(([key, value]) => ({ key, value: round(value ?? 0) }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 6);
}

function buildThreadId(analysis: Analysis, targetId: string) {
  return `${analysis.stateId}:${targetId}`;
}

function getRepeatedRead(points: ThreadPoint[]) {
  const counts = new Map<string, number>();
  for (const point of points.slice(-5)) {
    if (!point.readId) continue;
    counts.set(point.readId, (counts.get(point.readId) ?? 0) + 1);
  }
  const [readId, count] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0] ?? [null, 0];
  return { readId, count };
}

function getSessionReadId(session: HumSession) {
  const source = session as HumSession & { readId?: string; momentRead?: { readId?: string }; read?: { readId?: string } };
  return source.readId ?? source.momentRead?.readId ?? source.read?.readId ?? null;
}

function getSessionReadFamily(session: HumSession) {
  const source = session as HumSession & { readFamily?: string; momentRead?: { family?: string }; read?: { family?: string } };
  return source.readFamily ?? source.momentRead?.family ?? source.read?.family ?? session.signalType ?? null;
}

function getFeedbackInfluence(readFeedback: ThreadFeedbackEntry[], targetId: string) {
  const matching = readFeedback.filter((entry) => entry.targetId === targetId);
  const tooStrongCount = matching.filter((entry) => entry.feedback === "too_strong").length;
  const notQuiteCount = matching.filter((entry) => entry.feedback === "not_quite").length;
  const tooSoftCount = matching.filter((entry) => entry.feedback === "too_soft").length;
  const fitsCount = matching.filter((entry) => entry.feedback === "fits").length;
  return { tooStrongCount, notQuiteCount, tooSoftCount, fitsCount, softened: tooStrongCount >= 2 };
}

function countDaysCovered(sessions: HumSession[]) {
  const days = new Set(
    sessions
      .map((session) => new Date(session.createdAt))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => date.toISOString().slice(0, 10)),
  );
  return days.size;
}

function getCleanRatio(sessions: HumSession[]) {
  if (!sessions.length) return 0;
  return sessions.filter((session) => session.quality === "clean" && session.captureQuality !== "soft_usable").length / sessions.length;
}

function slope(values: number[]) {
  if (values.length < 2) return 0;
  const meanX = (values.length - 1) / 2;
  const meanY = average(values);
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  return denominator ? numerator / denominator : 0;
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function getMedian(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0.5;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalize(value: number | null | undefined, low: number, high: number) {
  if (value === null || value === undefined || Number.isNaN(value)) return 0.5;
  return clamp((value - low) / (high - low), 0, 1);
}

function inverseNormalize(value: number | null | undefined, low: number, high: number) {
  return 1 - normalize(value, low, high);
}

function normalizeSigned(score: number) {
  return clamp(0.5 + clamp(score, -1.5, 1.5) / 3, 0, 1);
}

function average(values: number[]) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return 0.5;
  return finite.reduce((total, value) => total + value, 0) / finite.length;
}

function averagePositive(values: number[]) {
  return average(values.map((value) => Math.max(0, value)));
}

function abs(value: number | null | undefined) {
  return typeof value === "number" ? Math.abs(value) : null;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function roundRecord(values: Partial<Record<DimensionKey, number>>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, round(value ?? 0)])) as Partial<Record<DimensionKey, number>>;
}

function plural(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function withDebug(insight: ThreadInsight, debug: ThreadInsightDebug): ThreadInsightResult {
  return { ...insight, debug };
}
