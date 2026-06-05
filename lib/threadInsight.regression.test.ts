import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { getHumFeatureDisplay } from "./humFeatureDisplay";
import { humFeatureVectorKeys } from "./humFeatureInventory";
import { buildHumInsightInterpretation } from "./humInsightInterpretation";
import { buildThreadInsight } from "./threadInsight";
import type { AudioFeatures, BaselineComparison, DimensionScores, HumSession, ThreadInsight } from "@/types/hum";

test("feature inventory only references stored AudioFeatures keys", () => {
  const feature = baseFeature();

  for (const key of humFeatureVectorKeys) {
    assert.equal(key in feature, true, `${key} is missing from the saved feature shape`);
  }
});

test("Read and Thread import the same interpretation helper", () => {
  const readSource = readFileSync(join(process.cwd(), "components", "screens", "ReadScreen.tsx"), "utf8");
  const threadSource = readFileSync(join(process.cwd(), "lib", "threadInsight.ts"), "utf8");

  assert.match(readSource, /buildHumInsightInterpretation/);
  assert.match(threadSource, /buildHumInsightInterpretation/);
});

test("1 usable hum returns baseline one clean point without personal trend language", () => {
  const insight = buildThreadInsight([session(0)]);
  const copy = getMainThreadCopy(insight);

  assert.equal(insight.pattern, "BASELINE_ONE_CLEAN_POINT");
  assert.match(insight.threadSummary ?? "", /cannot tell what repeats yet/i);
  assert.doesNotMatch(copy, /than usual|your baseline|pattern confirmed/i);
});

test("3 usable hums collect range with direct baseline wording", () => {
  const insight = buildThreadInsight([session(0), session(1), session(2)]);
  const copy = getMainThreadCopy(insight);

  assert.equal(insight.pattern, "BASELINE_COLLECTING_RANGE");
  assert.match(insight.threadSummary ?? "", /not enough to call a real pattern/i);
  assert.doesNotMatch(copy, vagueThreadCopy);
});

test("4 usable hums says one more clean hum unlocks first baseline", () => {
  const insight = buildThreadInsight([session(0), session(1), session(2), session(3)]);

  assert.equal(insight.pattern, "BASELINE_READY_NEXT_HUM");
  assert.match(insight.headline ?? "", /one more clean hum unlocks/i);
});

test("exactly 5 usable hums activates early baseline without overstating", () => {
  const insight = buildThreadInsight(Array.from({ length: 5 }, (_, index) => session(index)));

  assert.equal(insight.pattern, "FIRST_BASELINE_ACTIVE");
  assert.equal(insight.title, "Early pattern");
  assert.match(insight.threadSummary ?? "", /still early/i);
  assert.doesNotMatch(getMainThreadCopy(insight), /strong baseline|outside your usual range/i);
});

test("pressure build-up requires charge, residual instability, and lower stability", () => {
  const insight = buildThreadInsight([
    ...Array.from({ length: 7 }, (_, index) => scoredSession(index, { activationScore: -0.4, stabilityScore: 0.3 })),
    ...Array.from({ length: 4 }, (_, index) =>
      scoredSession(index + 7, { activationScore: 1, stabilityScore: -0.9, continuityScore: -0.4 }, pressureFeature()),
    ),
  ]);

  assert.equal(insight.pattern, "PRESSURE_BUILDING");
  assert.deepEqual(insight.debug.debugMetrics?.pressureEvidenceFamilies.includes("activation high"), true);
  assert.match(insight.threadSummary ?? "", /carrying more charge/i);
});

test("pressure easing names recovery after earlier pressure", () => {
  const insight = buildThreadInsight([
    ...Array.from({ length: 8 }, (_, index) =>
      scoredSession(index, { activationScore: 1, stabilityScore: -0.9, continuityScore: -0.4 }, pressureFeature()),
    ),
    ...Array.from({ length: 5 }, (_, index) => scoredSession(index + 8, { activationScore: -0.2, stabilityScore: 0.7, continuityScore: 0.5 })),
  ]);

  assert.ok(["PRESSURE_EASING", "RECOVERY_AFTER_PRESSURE", "CALMER_THAN_RECENT"].includes(insight.pattern));
  assert.match(getMainThreadCopy(insight), /easing|recovery|calmer/i);
});

test("7-hum recovery thread says pressure is easing but energy is lower", () => {
  const insight = buildThreadInsight([
    ...Array.from({ length: 4 }, (_, index) =>
      scoredSession(index, { activationScore: 0.9, stabilityScore: -0.8, continuityScore: -0.35 }, pressureFeature()),
    ),
    ...Array.from({ length: 3 }, (_, index) =>
      scoredSession(index + 4, { activationScore: -0.35, stabilityScore: 0.6, continuityScore: 0.45 }, lowFuelClearFeature()),
    ),
  ]);
  const copy = getMainThreadCopy(insight);

  assert.ok(["PRESSURE_EASING", "RECOVERY_AFTER_PRESSURE", "CALMER_THAN_RECENT"].includes(insight.pattern));
  assert.match(insight.headline ?? "", /Pressure is easing, but energy is lower|calmer/i);
  assert.match(copy, /recovery, not a full reset|short recovery window/i);
  assert.match(copy, /Do not immediately add more tasks|Protect the quieter state/i);
  assert.doesNotMatch(copy, vagueThreadCopy);
  assert.doesNotMatch(copy, /\u2014|residual instability|Activation/i);
});

test("one high activation outlier becomes a one-off spike", () => {
  const insight = buildThreadInsight([
    ...Array.from({ length: 7 }, (_, index) => scoredSession(index, { activationScore: 0, stabilityScore: 0.4 })),
    scoredSession(7, { activationScore: 1.3, stabilityScore: -0.8 }, pressureFeature({ residualInstabilityScore: 0.7 })),
  ]);

  assert.equal(insight.pattern, "STRESS_SPIKE_ONE_OFF");
  assert.match(insight.threadSummary ?? "", /one hum jumped/i);
});

test("repeated spikes become repeating stress-like spikes", () => {
  const insight = buildThreadInsight([
    ...Array.from({ length: 7 }, (_, index) => scoredSession(index, { activationScore: 0, stabilityScore: 0.3 })),
    scoredSession(7, { activationScore: 1.2, stabilityScore: -0.8 }, pressureFeature()),
    scoredSession(8, { activationScore: 0, stabilityScore: 0.3 }),
    scoredSession(9, { activationScore: 1.2, stabilityScore: -0.8 }, pressureFeature()),
  ]);

  assert.equal(insight.pattern, "STRESS_SPIKE_REPEATING");
});

test("energy dip detects lower energy, brightness, and expression", () => {
  const insight = buildThreadInsight([
    ...Array.from({ length: 7 }, (_, index) => scoredSession(index, { activationScore: 0.4 }, expressiveFeature())),
    ...Array.from({ length: 5 }, (_, index) => scoredSession(index + 7, { activationScore: -0.8 }, mutedFeature())),
  ]);

  assert.ok(["ENERGY_DIPPING", "MUTED_PATTERN", "LOW_MOOD_LIKE_PATTERN", "DEPRESSION_LIKE_HEAVINESS_PATTERN"].includes(insight.pattern));
  assert.match(getMainThreadCopy(insight), /energy|muted|lift/i);
});

test("low recovery pattern requires repeated low-recovery evidence", () => {
  const insight = buildThreadInsight([
    ...Array.from({ length: 7 }, (_, index) => scoredSession(index, { activationScore: 0.1 })),
    ...Array.from({ length: 4 }, (_, index) => scoredSession(index + 7, { activationScore: -0.6, continuityScore: -0.7 }, lowRecoveryFeature())),
  ]);

  assert.equal(insight.pattern, "LOW_RECOVERY_PATTERN");
});

test("low mood-like and heavier low-mood pattern require repeated post-baseline evidence", () => {
  const two = buildThreadInsight([
    ...Array.from({ length: 6 }, (_, index) => scoredSession(index, { activationScore: 0 })),
    scoredSession(6, { activationScore: -0.9 }, mutedFeature()),
    scoredSession(7, { activationScore: -0.9 }, mutedFeature()),
  ]);
  const three = buildThreadInsight([
    ...Array.from({ length: 6 }, (_, index) => scoredSession(index, { activationScore: 0 })),
    scoredSession(6, { activationScore: -0.9 }, mutedFeature()),
    scoredSession(7, { activationScore: -0.9 }, mutedFeature()),
    scoredSession(8, { activationScore: -0.9 }, mutedFeature()),
    scoredSession(9, { activationScore: -0.9 }, mutedFeature()),
  ]);

  assert.equal(two.pattern, "LOW_MOOD_LIKE_PATTERN");
  assert.equal(three.pattern, "DEPRESSION_LIKE_HEAVINESS_PATTERN");
  assert.match(three.guardrailNote ?? "", /not a diagnosis/i);
});

test("emotionally loaded and mixed states avoid vague pulls language", () => {
  const emotional = buildThreadInsight([
    ...Array.from({ length: 7 }, (_, index) => scoredSession(index, { activationScore: 0 })),
    ...Array.from({ length: 4 }, (_, index) =>
      scoredSession(index + 7, { activationScore: 0, stabilityScore: -0.7 }, emotionalFeature()),
    ),
  ]);
  const mixed = buildThreadInsight(
    Array.from({ length: 12 }, (_, index) =>
      scoredSession(index, index >= 8 ? { activationScore: 0.7, stabilityScore: 0.6, continuityScore: -0.7 } : { activationScore: 0 }),
    ),
  );

  assert.ok(["EMOTIONAL_LOAD_REPEATING", "HOLDING_BACK_PATTERN", "PRESSURE_BUILDING", "BRACING_PATTERN", "STRESS_SPIKE_REPEATING"].includes(emotional.pattern));
  assert.ok(["MIXED_BUT_STABLE", "VOLATILE_PATTERN", "VOICE_MORE_INTERRUPTED"].includes(mixed.pattern));
  assert.doesNotMatch(`${getMainThreadCopy(emotional)} ${getMainThreadCopy(mixed)}`, vagueThreadCopy);
});

test("clean stable data can return steady baseline or unclear good data", () => {
  const insight = buildThreadInsight(Array.from({ length: 12 }, (_, index) => scoredSession(index, { activationScore: 0, stabilityScore: 0, continuityScore: 0 })));

  assert.ok(["STEADY_BASELINE_HOLDING", "THREAD_UNCLEAR_GOOD_DATA"].includes(insight.pattern));
  assert.doesNotMatch(getMainThreadCopy(insight), vagueThreadCopy);
});

test("weak data returns thread unclear weak data", () => {
  const insight = buildThreadInsight(
    Array.from({ length: 10 }, (_, index) => ({
      ...session(index, {}, weakFeature()),
      quality: index < 6 ? "borderline" : "clean",
      captureQuality: "usable",
    })),
  );

  assert.equal(insight.pattern, "THREAD_UNCLEAR_WEAK_DATA");
  assert.match(insight.threadSummary ?? "", /not consistent enough/i);
});

test("feedback can soften repeated pressure confidence", () => {
  const base = [
    ...Array.from({ length: 7 }, (_, index) => scoredSession(index, { activationScore: -0.4, stabilityScore: 0.3 })),
    ...Array.from({ length: 4 }, (_, index) =>
      scoredSession(index + 7, { activationScore: 1, stabilityScore: -0.9, continuityScore: -0.4 }, pressureFeature()),
    ),
  ];
  const first = buildThreadInsight(base);
  const softened = buildThreadInsight({
    sessions: base,
    readFeedback: [
      feedback(first, "too_strong", "a"),
      feedback(first, "too_strong", "b"),
    ],
  });

  assert.notEqual(softened.pattern, "PRESSURE_BUILDING");
  assert.match(softened.whatItMayMean ?? "", /too strongly/i);
});

test("Thread details keep raw acoustic evidence available", () => {
  const insight = buildThreadInsight([
    session(0, { signalToNoiseProxy: 0.1 }),
    session(1, { signalToNoiseProxy: 0.1 }),
    session(2, { signalToNoiseProxy: 0.1 }),
    session(3, { signalToNoiseProxy: 0.1 }),
    session(4, { signalToNoiseProxy: 0.1 }),
    session(5, { signalToNoiseProxy: 0.1 }),
    session(6, { signalToNoiseProxy: 3.75 }),
  ]);
  const detail = insight.todayVsUsual?.changed.find((item) => item.key === "signalToNoiseProxy");

  assert.equal(detail?.label, "Sound clarity");
  assert.match(detail?.debugEvidence ?? "", /Signal-to-noise proxy higher than usual/);
});

test("diary entries use hum history language and do not carry song shortcuts", () => {
  const insight = buildThreadInsight(
    Array.from({ length: 7 }, (_, index) => ({
      ...session(index, { inputRms: index >= 4 ? 1.5 : 0.1 }),
      captureQuality: "good" as const,
      labelConfidence: 0.82,
    })),
  );
  const entry = insight.diary?.[0];

  assert.ok(entry);
  assert.equal(entry.song, null);
  assert.equal(entry.quality, "Good quality");
  assert.match(entry.evidence ?? "", /Your hum|stayed close|usual/i);
  assert.doesNotMatch([entry.label, entry.evidence, entry.song].join(" "), /Signal-to-noise|proxy/i);
});

test("History diary row source does not render Song buttons", () => {
  const source = readFileSync(join(process.cwd(), "components", "HistoryView.tsx"), "utf8");
  const timelineRowSource = source.slice(source.indexOf("function TimelineRow"), source.indexOf("const feedbackButtons"));

  assert.equal(timelineRowSource.includes("timeline-play-button"), false);
  assert.equal(timelineRowSource.includes("diaryItem?.song"), false);
  assert.equal(timelineRowSource.includes("musicRecommendation && onSongMatch"), false);
  assert.equal(timelineRowSource.includes(">Song<"), false);
});

test("missing display alias falls back to a safe human label", () => {
  const display = getHumFeatureDisplay("rawDebugMetricName" as keyof AudioFeatures);

  assert.equal(display.label, "Hum detail");
  assert.doesNotMatch(display.label, /rawDebugMetricName|raw debug metric name|_/i);
});

test("Thread exposes the same comparison produced by the shared helper", () => {
  const sessions = Array.from({ length: 7 }, (_, index) => session(index, { inputRms: index >= 4 ? 1.5 : 0.1 }));
  const interpretation = buildHumInsightInterpretation(sessions);
  const insight = buildThreadInsight(sessions);

  assert.equal(insight.feedbackTargetId, interpretation.feedbackTargetId);
  assert.deepEqual(
    insight.todayVsUsual?.changed.map((item) => item.key),
    interpretation.todayVsUsual.changed.map((item) => item.key),
  );
});

test("thread user-facing copy avoids banned style and clinical overclaims", () => {
  const scenarios = [
    [session(0)],
    Array.from({ length: 3 }, (_, index) => session(index)),
    Array.from({ length: 5 }, (_, index) => session(index)),
    Array.from({ length: 12 }, (_, index) => scoredSession(index, { activationScore: 0, stabilityScore: 0, continuityScore: 0 })),
    [
      ...Array.from({ length: 7 }, (_, index) => scoredSession(index, { activationScore: -0.4, stabilityScore: 0.3 })),
      ...Array.from({ length: 4 }, (_, index) =>
        scoredSession(index + 7, { activationScore: 1, stabilityScore: -0.9, continuityScore: -0.4 }, pressureFeature()),
      ),
    ],
  ];
  const bannedClinical = /you have anxiety|you are depressed|you are sleep deprived|diagnosis|diagnosed/i;

  for (const sessions of scenarios) {
    const copy = getMainThreadCopy(buildThreadInsight(sessions));
    assert.doesNotMatch(copy, /\u2014/);
    assert.doesNotMatch(copy, vagueThreadCopy);
    assert.doesNotMatch(copy, bannedClinical);
  }
});

test("synthetic thread fixtures cover constructive longitudinal states", () => {
  const fixtures = [
    {
      name: "stable baseline holding",
      expected: ["STEADY_BASELINE_HOLDING", "THREAD_UNCLEAR_GOOD_DATA"],
      sessions: Array.from({ length: 12 }, (_, index) => scoredSession(index, { activationScore: 0, stabilityScore: 0, continuityScore: 0 })),
    },
    {
      name: "calmer than recent",
      expected: ["CALMER_THAN_RECENT", "MORE_CENTERED_THAN_RECENT", "VOICE_MORE_CONTINUOUS", "RECOVERY_AFTER_PRESSURE"],
      sessions: [
        ...Array.from({ length: 8 }, (_, index) => scoredSession(index, { activationScore: 0.8, stabilityScore: -0.5, continuityScore: -0.2 })),
        ...Array.from({ length: 4 }, (_, index) => scoredSession(index + 8, { activationScore: 0.1, stabilityScore: 0.65, continuityScore: 0.35 })),
      ],
    },
    {
      name: "energy rising cleanly",
      expected: ["ENERGY_RISING_CLEANLY"],
      sessions: [
        ...Array.from({ length: 7 }, (_, index) => scoredSession(index, { activationScore: -0.5, stabilityScore: 0.1, controlScore: 0.3 })),
        ...Array.from({ length: 5 }, (_, index) => scoredSession(index + 7, { activationScore: 0.35, stabilityScore: 0.2, controlScore: 0.4 })),
      ],
    },
    {
      name: "expression opening",
      expected: ["EXPRESSION_OPENING", "ENERGY_RISING_CLEANLY"],
      sessions: [
        ...Array.from({ length: 7 }, (_, index) => scoredSession(index, { activationScore: 0, stabilityScore: 0.1 }, { musicalityScore: 0.32, controlledExpressionScore: 0.42 })),
        ...Array.from({ length: 5 }, (_, index) =>
          scoredSession(index + 7, { activationScore: 0, stabilityScore: 0.2 }, expressiveFeature({ inputRms: 0.04, meanRms: 0.035 })),
        ),
      ],
    },
    {
      name: "control improving",
      expected: ["CONTROL_IMPROVING", "MORE_CENTERED_THAN_RECENT", "VOICE_MORE_CONTINUOUS"],
      sessions: [
        ...Array.from({ length: 7 }, (_, index) => scoredSession(index, { controlScore: -0.5, stabilityScore: -0.2, continuityScore: -0.1 })),
        ...Array.from({ length: 5 }, (_, index) => scoredSession(index + 7, { controlScore: 0.45, stabilityScore: 0.3, continuityScore: 0.2 })),
      ],
    },
    {
      name: "voice more continuous",
      expected: ["VOICE_MORE_CONTINUOUS", "MORE_CENTERED_THAN_RECENT", "RECOVERY_AFTER_PRESSURE"],
      sessions: [
        ...Array.from({ length: 7 }, (_, index) => scoredSession(index, { continuityScore: -0.5, stabilityScore: -0.2 })),
        ...Array.from({ length: 5 }, (_, index) => scoredSession(index + 7, { continuityScore: 0.45, stabilityScore: 0.2 })),
      ],
    },
    {
      name: "pressure building",
      expected: ["PRESSURE_BUILDING"],
      sessions: [
        ...Array.from({ length: 7 }, (_, index) => scoredSession(index, { activationScore: -0.4, stabilityScore: 0.3 })),
        ...Array.from({ length: 4 }, (_, index) =>
          scoredSession(index + 7, { activationScore: 1, stabilityScore: -0.9, continuityScore: -0.4 }, pressureFeature()),
        ),
      ],
    },
    {
      name: "mixed but stable",
      expected: ["MIXED_BUT_STABLE", "VOICE_MORE_INTERRUPTED", "VOLATILE_PATTERN"],
      sessions: Array.from({ length: 12 }, (_, index) =>
        scoredSession(index, index >= 8 ? { activationScore: 0.7, stabilityScore: 0.6, continuityScore: -0.7 } : { activationScore: 0 }),
      ),
    },
    {
      name: "unclear good data",
      expected: ["STEADY_BASELINE_HOLDING", "THREAD_UNCLEAR_GOOD_DATA"],
      sessions: Array.from({ length: 12 }, (_, index) => scoredSession(index, { activationScore: 0.03, stabilityScore: 0.02, continuityScore: 0.01 })),
    },
  ];

  for (const fixture of fixtures) {
    const insight = buildThreadInsight(fixture.sessions);
    const metrics = insight.debug.debugMetrics;
    const line = [
      fixture.name,
      `expected ${fixture.expected.join("/")}`,
      `actual ${insight.pattern}`,
      `confidence ${insight.confidence}`,
      `recovery ${metrics?.recoveryScore}`,
      `mixed ${metrics?.mixedPatternScore}`,
      `pressure ${metrics?.pressureEvidenceFamilies.join(",")}`,
    ].join(" | ");

    assert.ok(fixture.expected.includes(insight.pattern), line);
    assert.doesNotMatch(getMainThreadCopy(insight), /\u2014/);
    assert.doesNotMatch(getMainThreadCopy(insight), vagueThreadCopy);
  }
});

function feedback(insight: ThreadInsight, feedbackValue: "fits" | "not_quite" | "too_strong" | "too_soft", id: string) {
  return {
    id,
    createdAt: day(20),
    targetId: insight.feedbackTargetId,
    pattern: insight.pattern,
    feedback: feedbackValue,
    concernLevel: insight.concernLevel,
    threadInsightTitle: insight.title,
    evidenceCount: insight.evidenceCount,
    daysCovered: insight.daysCovered,
  };
}

function getMainThreadCopy(insight: ThreadInsight) {
  return [
    insight.title,
    insight.headline,
    insight.threadSummary,
    insight.whatChanged,
    insight.whatRepeated,
    insight.whatItMayMean,
    insight.tryThis,
    insight.behaviorSummary,
    insight.behaviorPattern,
    insight.guardrailNote,
    ...(insight.evidence ?? []),
    ...(insight.tags ?? []),
    ...(insight.behaviorSignals ?? []).map((item) => item.label),
    ...(insight.diary ?? []).map((item) => `${item.label ?? ""} ${item.evidence ?? ""} ${item.quality ?? ""} ${item.confidence ?? ""} ${item.includedInBaseline ?? ""}`),
  ].join(" ");
}

function scoredSession(index: number, scoreOverrides: Partial<DimensionScores>, featureOverrides: Partial<AudioFeatures> = {}) {
  return session(index, {}, featureOverrides, scores(scoreOverrides));
}

function session(
  index: number,
  zScores: Partial<Record<keyof AudioFeatures, number>> = {},
  featureOverrides: Partial<AudioFeatures> = {},
  dimensionScores: DimensionScores | null = null,
): HumSession {
  const feature = baseFeature({
    inputRms: 0.04 + (zScores.inputRms ?? 0) * 0.008,
    meanRms: 0.035 + (zScores.inputRms ?? 0) * 0.006,
    medianRms: 0.032 + (zScores.inputRms ?? 0) * 0.006,
    pitchRange: 4 + (zScores.pitchRange ?? 0) * 0.5,
    ...featureOverrides,
  });

  return {
    id: `session-${index}`,
    sessionId: `session-${index}`,
    createdAt: day(index),
    checkInAvailableAt: day(index, 1),
    features: feature,
    storedFeatureKeys: Object.keys(feature) as Array<keyof AudioFeatures>,
    quality: "clean",
    captureQuality: "usable",
    confidenceWeight: 1,
    baselineVersion: 2,
    validBaselineCount: Math.max(1, index + 1),
    includedInBaseline: true,
    baselineComparison: comparison(zScores),
    dimensionScores,
    labelConfidence: null,
    audioKey: null,
    audioMimeType: null,
    signal: "Close to your usual pattern",
    signalType: "close",
    musicRecommendation: null,
    musicSession: null,
    action: {
      id: "water-reset",
      type: "low-energy",
      title: "Water reset",
      description: "Drink a glass of water.",
    },
    actionId: "water-reset",
    pickedFromLearning: false,
    feedback: null,
    userFeedback: null,
    actionFeedback: null,
    taskType: "daily_hum",
    metadata: {
      deviceMemoryGb: null,
      hardwareConcurrency: null,
      userAgent: null,
      platform: null,
      language: null,
      browser: null,
      sampleRate: null,
      audioMimeType: null,
    },
    mlData: null as unknown as HumSession["mlData"],
    researchConsent: false,
    audioRetainedForResearch: false,
    featureExportAllowed: false,
  };
}

function comparison(zScores: Partial<Record<keyof AudioFeatures, number>>): BaselineComparison {
  return {
    baselineVersion: 2,
    baselineCount: 6,
    zScores: {
      ...zScores,
      inputRms: zScores.inputRms ?? 0,
      meanRms: zScores.inputRms ?? 0,
      medianRms: zScores.inputRms ?? 0,
      rmsEnergy: zScores.rmsEnergy ?? zScores.inputRms ?? 0,
      pitchRange: zScores.pitchRange ?? 0,
    },
    ratios: {},
  };
}

function scores(overrides: Partial<DimensionScores> = {}): DimensionScores {
  return {
    activationScore: 0,
    stabilityScore: 0,
    clarityScore: 0,
    smoothnessScore: 0,
    continuityScore: 0,
    controlScore: 0,
    baselineDistanceScore: 0,
    ...overrides,
  };
}

function pressureFeature(overrides: Partial<AudioFeatures> = {}) {
  return {
    pitchRange: 11,
    pitchVariance: 1500,
    jitter: 0.05,
    residualInstabilityScore: 0.72,
    residualPitchInstability: 0.72,
    residualAmplitudeInstability: 0.58,
    phraseContinuityCoverage: 0.36,
    voicingContinuityCoverage: 0.58,
    pitchStableSegmentCoverage: 0.38,
    breakCount: 2,
    pauseCount: 2,
    avgPauseLength: 0.42,
    microBreakRatio: 0.07,
    musicalityScore: 0.28,
    controlledExpressionScore: 0.48,
    ...overrides,
  };
}

function mutedFeature(overrides: Partial<AudioFeatures> = {}) {
  return {
    inputRms: 0.018,
    meanRms: 0.014,
    rmsEnergy: 0.00025,
    activeFrameRatio: 0.5,
    quietFrameRatio: 0.34,
    spectralCentroid: 360,
    spectralRolloff: 640,
    spectralBandwidth: 95,
    spectralFlux: 0.015,
    pitchRange: 1.6,
    pitchVariance: 90,
    musicalityScore: 0.16,
    controlledExpressionScore: 0.18,
    phraseContinuityCoverage: 0.34,
    breathinessProxy: 0.58,
    clarityScore: 0.62,
    ...overrides,
  };
}

function lowRecoveryFeature(overrides: Partial<AudioFeatures> = {}) {
  return mutedFeature({
    spectralCentroid: 900,
    spectralRolloff: 1200,
    spectralBandwidth: 240,
    musicalityScore: 0.54,
    controlledExpressionScore: 0.56,
    breathinessProxy: 0.68,
    phraseContinuityCoverage: 0.28,
    voicingContinuityCoverage: 0.46,
    clarityScore: 0.48,
    ...overrides,
  });
}

function lowFuelClearFeature(overrides: Partial<AudioFeatures> = {}) {
  return {
    inputRms: 0.022,
    meanRms: 0.018,
    peakAmplitude: 0.16,
    rmsEnergy: 0.0006,
    activeFrameRatio: 0.68,
    pitchRange: 3.2,
    pitchVariance: 160,
    residualInstabilityScore: 0.24,
    residualPitchInstability: 0.22,
    residualAmplitudeInstability: 0.2,
    phraseContinuityCoverage: 0.76,
    voicingContinuityCoverage: 0.82,
    pitchStableSegmentCoverage: 0.78,
    musicalityScore: 0.56,
    controlledExpressionScore: 0.68,
    clarityScore: 0.82,
    signalToNoiseProxy: 16,
    ...overrides,
  };
}

function emotionalFeature(overrides: Partial<AudioFeatures> = {}) {
  return {
    pitchRange: 4,
    pitchVariance: 120,
    jitter: 0.05,
    residualInstabilityScore: 0.74,
    residualPitchInstability: 0.74,
    residualAmplitudeInstability: 0.62,
    phraseContinuityCoverage: 0.58,
    voicingContinuityCoverage: 0.7,
    pitchStableSegmentCoverage: 0.58,
    musicalityScore: 0.26,
    controlledExpressionScore: 0.34,
    ...overrides,
  };
}

function expressiveFeature(overrides: Partial<AudioFeatures> = {}) {
  return {
    inputRms: 0.055,
    meanRms: 0.05,
    peakAmplitude: 0.4,
    spectralCentroid: 1300,
    spectralRolloff: 2400,
    musicalityScore: 0.78,
    controlledExpressionScore: 0.76,
    phraseContourScore: 0.78,
    residualInstabilityScore: 0.22,
    residualPitchInstability: 0.2,
    residualAmplitudeInstability: 0.18,
    phraseContinuityCoverage: 0.82,
    voicingContinuityCoverage: 0.86,
    ...overrides,
  };
}

function weakFeature(overrides: Partial<AudioFeatures> = {}) {
  return {
    duration: 9,
    signalToNoiseProxy: 4,
    clarityScore: 0.42,
    pitchCoverage: 0.66,
    activeFrameRatio: 0.66,
    quietFrameRatio: 0.3,
    silenceRatio: 0.2,
    ...overrides,
  };
}

function baseFeature(overrides: Partial<AudioFeatures> = {}): AudioFeatures {
  return {
    duration: 12,
    rmsEnergy: 0.002,
    silenceRatio: 0.08,
    zeroCrossingRate: 0.01,
    spectralCentroid: 900,
    spectralBandwidth: 120,
    spectralRolloff: 900,
    spectralFlux: 0.05,
    spectralFlatness: 0.15,
    pitchMean: 180,
    pitchHz: 180,
    pitchVariance: 0.5,
    pitchStability: 0.03,
    jitter: 0.01,
    shimmerProxy: 0.03,
    hnrProxy: 0.9,
    signalToNoiseProxy: 20,
    clarityScore: 0.9,
    vibratoScore: null,
    vibratoRate: null,
    vibratoDepth: null,
    vibratoRegularity: null,
    tremorProxy: null,
    glideScore: null,
    amplitudeStability: 0.02,
    breakCount: 0,
    avgPauseLength: 0,
    pauseCount: 0,
    microBreakRatio: 0,
    pauseStructureScore: null,
    smoothnessScore: 0.8,
    pitchDrift: 0.02,
    pitchRange: 4,
    noteChangeRate: 0.1,
    melodicSmoothness: 0.8,
    rhythmicStability: 0.8,
    sustainStability: 0.8,
    breathBreakCount: 0,
    attackConsistency: 0.8,
    pitchContourShape: 0.1,
    pitchCoverage: 0.92,
    onsetDelay: 0.1,
    longestStableSegment: 9.5,
    breathinessProxy: 0.1,
    musicalityScore: 0.8,
    controlledExpressionScore: 0.72,
    residualPitchInstability: 0.2,
    residualAmplitudeInstability: 0.2,
    residualInstabilityScore: 0.25,
    stableSegmentCoverage: 0.92,
    voicingContinuityCoverage: 0.9,
    pitchStableSegmentCoverage: 0.9,
    phraseContinuityCoverage: 0.9,
    notePlateauScore: 0.5,
    stepwiseMelodicScore: 0.7,
    repeatedPitchRegionScore: 0.4,
    phraseContourScore: 0.7,
    inputRms: 0.04,
    meanRms: 0.035,
    medianRms: 0.032,
    activeFrameRatio: 0.9,
    quietFrameRatio: 0.05,
    clippedFrameRatio: 0,
    noiseFloorRms: 0.002,
    peakAmplitude: 0.16,
    isTooFaint: false,
    isSilent: false,
    ...overrides,
  };
}

function day(dayOffset: number, minuteOffset = 0) {
  return new Date(Date.UTC(2026, 0, 1 + dayOffset, 10, minuteOffset)).toISOString();
}

const vagueThreadCopy =
  /pieces pulling|broader shape|familiar footing|competing pulls|not settled enough to name|Do not overread|overread this one|Do not refill|usual delivery|residual instability|Activation and vocal wobble|restless activation|effortful activation|wellness journey|nervous system knows|trust the process/i;
