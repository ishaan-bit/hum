import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMomentRead, readCopyVariants } from "./momentRead";
import type { AudioFeatures, BaselineStats, DimensionScores } from "@/types/hum";

test("first usable charged hum returns alert not relaxed without personal comparison language", () => {
  const read = buildMomentRead({
    features: feature({
      duration: 11.4,
      activeFrameRatio: 0.755,
      pitchCoverage: 0.779,
      silenceRatio: 0.158,
      quietFrameRatio: 0.154,
      signalToNoiseProxy: 4.93,
      peakAmplitude: 0.7326,
      clarityScore: 0.552,
      pitchRange: 11.82,
      pitchVariance: 1699.5,
      jitter: 0.038792,
      pitchDrift: -0.1228,
      longestStableSegment: 4.52,
      musicalityScore: 0.3467,
      controlledExpressionScore: 0.5067,
      residualInstabilityScore: 0.4235,
      residualPitchInstability: 0.581,
      residualAmplitudeInstability: 0.2985,
      voicingContinuityCoverage: 0.5609,
      pitchStableSegmentCoverage: 0.3968,
      phraseContinuityCoverage: 0.3124,
      breakCount: 2,
      pauseCount: 2,
      avgPauseLength: 0.47,
      microBreakRatio: 0.068,
    }),
    baseline: null,
    baselineProgress: 1,
    validBaselineCount: 1,
    quality: "clean",
    captureQuality: "usable",
  });

  const output = readOutput(read);
  assert.equal(read.readId, "ALERT_NOT_RELAXED");
  assert.equal(read.stateLabel, "Alert, not relaxed");
  assert.match(read.mainSentence, /switched on, clear enough to function, but carrying extra charge/i);
  assert.match(read.todayVsUsualBody, /Hum does not know your usual yet/i);
  assert.equal(read.calibrationLine, "Learning your baseline · 1 of 5 hums");
  assert.deepEqual(read.whyClues.slice(0, 5), [
    "Clean signal",
    "Strong voicing",
    "Extra pitch movement",
    "Small vocal wobble",
    "Brief breaks",
  ]);
  assert.doesNotMatch(output, /than usual|baseline shape|compared with your usual|High alert|higher activation|less settled shape|usable delivery/i);
});

test("hums two to four use early pattern language, not baseline certainty", () => {
  const read = buildMomentRead({
    features: chargedFeature(),
    baseline: null,
    baselineProgress: 3,
    validBaselineCount: 3,
    quality: "clean",
    captureQuality: "good",
  });

  assert.match(read.todayVsUsualBody, /still building your baseline/i);
  assert.match(read.baselineNoteBody, /3 of 5 clean hums/i);
  assert.doesNotMatch(readOutput(read), /outside your usual range|compared with your usual|baseline shape/i);
});

test("hum five activates early baseline language", () => {
  const read = buildMomentRead({
    features: chargedFeature(),
    baseline: baseline(5),
    baselineProgress: 5,
    validBaselineCount: 5,
    quality: "clean",
    captureQuality: "good",
  });

  assert.match(read.todayVsUsualBody, /Hum now has 5 clean hums/i);
  assert.match(read.baselineNoteTitle, /Baseline active/i);
  assert.equal(read.calibrationLine, "Early baseline · 5 hums");
});

test("post-baseline high activation and residual instability returns a pressure read", () => {
  const read = buildMomentRead({
    features: chargedFeature({
      residualInstabilityScore: 0.8,
      residualPitchInstability: 0.82,
      phraseContinuityCoverage: 0.28,
      breakCount: 3,
      pauseCount: 3,
    }),
    baseline: baseline(12),
    baselineProgress: 12,
    validBaselineCount: 12,
    quality: "clean",
    captureQuality: "good",
    stateReasons: ["repeated pressure pattern building"],
    dimensionScores: scores({ activationScore: 1.2, stabilityScore: -1, continuityScore: -1 }),
  });

  assert.ok(["PRESSURED_FUNCTIONAL", "STRESS_SPIKE", "OVERLOADED", "BRACED_SCANNING"].includes(read.readId));
});

test("high musicality and control returns expressive or energized, not stress", () => {
  const read = buildMomentRead({
    features: feature({
      pitchRange: 10,
      noteChangeRate: 0.28,
      musicalityScore: 0.86,
      controlledExpressionScore: 0.84,
      phraseContourScore: 0.82,
      residualInstabilityScore: 0.24,
      residualPitchInstability: 0.2,
      residualAmplitudeInstability: 0.18,
      phraseContinuityCoverage: 0.82,
      voicingContinuityCoverage: 0.86,
      activeFrameRatio: 0.88,
    }),
    baseline: baseline(18),
    baselineProgress: 18,
    validBaselineCount: 18,
    quality: "clean",
    captureQuality: "good",
  });

  assert.ok(["EXPRESSIVE_OPEN", "ENERGIZED", "EXCITED_ALIVE"].includes(read.readId));
  assert.doesNotMatch(readOutput(read), /stress-like spike|anxiety-like/i);
});

test("clean ambiguous early-baseline hum does not fall into pressured functional", () => {
  const read = buildMomentRead({
    features: chargedFeature({
      residualInstabilityScore: 0.48,
      residualPitchInstability: 0.44,
      phraseContinuityCoverage: 0.58,
      breakCount: 0,
      pauseCount: 0,
    }),
    baseline: null,
    baselineProgress: 3,
    validBaselineCount: 3,
    quality: "clean",
    captureQuality: "good",
  });

  assert.ok(["ALERT_NOT_RELAXED", "RESTLESS_MIND", "MIXED_SIGNAL", "CLEAR_SIGNAL_NO_STRONG_STATE"].includes(read.readId));
  assert.notEqual(read.readId, "PRESSURED_FUNCTIONAL");
});

test("pressured functional requires multiple pressure evidence families after baseline", () => {
  const weakPressure = buildMomentRead({
    features: chargedFeature({
      residualInstabilityScore: 0.46,
      residualPitchInstability: 0.42,
      phraseContinuityCoverage: 0.72,
      breakCount: 0,
      pauseCount: 0,
    }),
    baseline: baseline(14),
    baselineProgress: 14,
    validBaselineCount: 14,
    quality: "clean",
    captureQuality: "good",
    dimensionScores: scores({ activationScore: 0.9, stabilityScore: 0.1, continuityScore: 0.2 }),
  });
  const strongerPressure = buildMomentRead({
    features: chargedFeature({
      residualInstabilityScore: 0.62,
      residualPitchInstability: 0.66,
      phraseContinuityCoverage: 0.4,
      breakCount: 2,
      pauseCount: 2,
    }),
    baseline: baseline(14),
    baselineProgress: 14,
    validBaselineCount: 14,
    quality: "clean",
    captureQuality: "good",
    dimensionScores: scores({ activationScore: 0.9, stabilityScore: -0.9, continuityScore: -0.6 }),
  });

  assert.notEqual(weakPressure.readId, "PRESSURED_FUNCTIONAL");
  assert.ok(["PRESSURED_FUNCTIONAL", "COMPOSED_UNDER_PRESSURE", "BRACED_SCANNING", "RESTLESS_MIND", "OVERLOADED"].includes(strongerPressure.readId));
});

test("early baseline composed pressure gives plain direct copy", () => {
  const read = buildMomentRead({
    features: feature({
      inputRms: 0.04,
      meanRms: 0.034,
      rmsEnergy: 0.002,
      peakAmplitude: 0.24,
      activeFrameRatio: 0.82,
      pitchRange: 11,
      pitchVariance: 1500,
      noteChangeRate: 0.42,
      pitchStability: 0.02,
      amplitudeStability: 0.015,
      residualInstabilityScore: 0.56,
      residualPitchInstability: 0.58,
      residualAmplitudeInstability: 0.46,
      jitter: 0.018,
      shimmerProxy: 0.03,
      controlledExpressionScore: 0.55,
      phraseContinuityCoverage: 0.4,
      voicingContinuityCoverage: 0.72,
      pitchStableSegmentCoverage: 0.88,
      stableSegmentCoverage: 0.9,
      longestStableSegment: 9.2,
      musicalityScore: 0.2,
      melodicSmoothness: 0.3,
      phraseContourScore: 0.3,
    }),
    baseline: baseline(7),
    baselineProgress: 7,
    validBaselineCount: 7,
    quality: "clean",
    captureQuality: "good",
    dimensionScores: scores({ activationScore: 0.6, stabilityScore: 0.25, continuityScore: -0.45, controlScore: 0.9 }),
  });
  const output = readOutput(read);

  assert.equal(read.readId, "COMPOSED_UNDER_PRESSURE");
  assert.match(read.stateLabel, /Composed under pressure/);
  assert.match(read.mainSentence, /keeping it together/i);
  assert.match(read.mainSentence, /costing effort/i);
  assert.match(read.explanation, /energy was lower/i);
  assert.match(read.todayVsUsualBody, /steadier in parts, but lower on energy/i);
  assert.match(read.whatThisMayFeelLike, /look fine from the outside/i);
  assert.match(read.tryToday, /remove one unnecessary demand/i);
  assert.match(read.footerNote, /personal read from your early baseline/i);
  assert.doesNotMatch(output, /residual instability|signal is asking|\u2014/);
});

test("low energy with stable control does not become pressured functional", () => {
  const read = buildMomentRead({
    features: feature({
      inputRms: 0.014,
      meanRms: 0.012,
      rmsEnergy: 0.00045,
      peakAmplitude: 0.12,
      activeFrameRatio: 0.68,
      controlledExpressionScore: 0.76,
      longestStableSegment: 7.5,
      stableSegmentCoverage: 0.78,
      phraseContinuityCoverage: 0.72,
      residualInstabilityScore: 0.38,
      residualPitchInstability: 0.34,
      residualAmplitudeInstability: 0.32,
      musicalityScore: 0.48,
    }),
    baseline: baseline(14),
    baselineProgress: 14,
    validBaselineCount: 14,
    quality: "clean",
    captureQuality: "good",
    dimensionScores: scores({ activationScore: -0.7, stabilityScore: 0.45, continuityScore: 0.35, controlScore: 0.7 }),
  });

  assert.ok(["TIRED_FUNCTIONAL", "CALM_LOW_FUEL"].includes(read.readId));
  assert.notEqual(read.readId, "PRESSURED_FUNCTIONAL");
});

test("high activation with high control and low residual instability becomes focus or energy", () => {
  const read = buildMomentRead({
    features: feature({
      inputRms: 0.065,
      meanRms: 0.06,
      peakAmplitude: 0.45,
      pitchRange: 6,
      musicalityScore: 0.62,
      controlledExpressionScore: 0.82,
      residualInstabilityScore: 0.2,
      residualPitchInstability: 0.18,
      residualAmplitudeInstability: 0.18,
      phraseContinuityCoverage: 0.78,
      voicingContinuityCoverage: 0.84,
    }),
    baseline: baseline(12),
    baselineProgress: 12,
    validBaselineCount: 12,
    quality: "clean",
    captureQuality: "good",
    dimensionScores: scores({ activationScore: 0.9, stabilityScore: 0.2, continuityScore: 0.4, controlScore: 0.9 }),
  });

  assert.ok(["FOCUSED_READY", "ENERGIZED", "SERIOUS_TASK_MODE"].includes(read.readId));
  assert.notEqual(read.readId, "PRESSURED_FUNCTIONAL");
});

test("low mood-like wording only appears after repeated post-baseline evidence", () => {
  const first = buildMomentRead({
    features: lowMoodFeature(),
    baseline: baseline(6),
    baselineProgress: 6,
    validBaselineCount: 6,
    quality: "clean",
    captureQuality: "good",
  });
  const repeated = buildMomentRead({
    features: lowMoodFeature(),
    baseline: baseline(8),
    baselineProgress: 8,
    validBaselineCount: 8,
    quality: "clean",
    captureQuality: "good",
    stateReasons: ["low mood repeated low energy"],
  });

  assert.equal(first.readId, "MUTED_TODAY");
  assert.equal(repeated.readId, "LOW_MOOD_LIKE");
});

test("depression-like heaviness only appears after at least three post-baseline hums and repeated evidence", () => {
  const tooEarly = buildMomentRead({
    features: lowMoodFeature(),
    baseline: baseline(7),
    baselineProgress: 7,
    validBaselineCount: 7,
    quality: "clean",
    captureQuality: "good",
    stateReasons: ["low mood repeated low energy"],
  });
  const repeated = buildMomentRead({
    features: lowMoodFeature(),
    baseline: baseline(9),
    baselineProgress: 9,
    validBaselineCount: 9,
    quality: "clean",
    captureQuality: "good",
    stateReasons: ["low mood repeated low energy heaviness"],
  });

  assert.notEqual(tooEarly.readId, "DEPRESSION_LIKE_HEAVINESS");
  assert.equal(repeated.readId, "DEPRESSION_LIKE_HEAVINESS");
});

test("weak capture returns needs another hum", () => {
  const read = buildMomentRead({
    features: feature({
      duration: 2,
      pitchCoverage: 0.2,
      activeFrameRatio: 0.2,
      silenceRatio: 0.65,
      quietFrameRatio: 0.7,
      clarityScore: 0.2,
      signalToNoiseProxy: 0.1,
      peakAmplitude: 0.01,
    }),
    baseline: null,
    baselineProgress: 1,
    validBaselineCount: 1,
    quality: "borderline",
    captureQuality: "poor",
  });

  assert.equal(read.readId, "NEEDS_ANOTHER_HUM");
  assert.doesNotMatch(readOutput(read), /stress|anxiety|low-mood-like|depression-like/i);
});

test("read outputs avoid em dash and clinical overclaims", () => {
  const variants = Object.values(readCopyVariants).flat();
  assert.ok(variants.length >= 40);

  for (const variant of variants) {
    const text = Object.values(variant).flat().join(" ");
    assert.doesNotMatch(text, /—/);
    assert.doesNotMatch(text, /you are depressed|you have anxiety|you are sleep deprived|diagnosed/i);
  }
});

test("read outputs avoid banned vague or technical style", () => {
  const variants = Object.values(readCopyVariants).flat();
  const bannedStyle =
    /\u2014|pieces pulling|competing pulls|familiar footing|broader shape|clearer center|more spread|signal is asking|overread this one|residual instability|activation|not settled enough|wellness journey|nervous system knows|trust the process/i;

  for (const variant of variants) {
    const text = Object.values(variant).flat().join(" ");
    assert.doesNotMatch(text, bannedStyle);
  }
});

test("synthetic read fixtures cover major state families without pressure defaults", () => {
  const fixtures = [
    {
      name: "deep settled fixture",
      expectedFamily: "settled",
      notPressure: true,
      input: readInput(
        feature({
          inputRms: 0.028,
          meanRms: 0.024,
          peakAmplitude: 0.14,
          musicalityScore: 0.42,
          controlledExpressionScore: 0.48,
          pitchRange: 2.8,
          phraseContourScore: 0.32,
          residualInstabilityScore: 0.18,
          residualPitchInstability: 0.18,
          residualAmplitudeInstability: 0.16,
          phraseContinuityCoverage: 0.86,
          voicingContinuityCoverage: 0.88,
          longestStableSegment: 9.6,
        }),
      ),
    },
    {
      name: "clear centered fixture",
      expectedIds: ["CLEAR_CENTERED", "DEEPLY_SETTLED", "EASY_OPEN"],
      notPressure: true,
      input: readInput(feature({ musicalityScore: 0.42, controlledExpressionScore: 0.72, pitchRange: 3.2, residualInstabilityScore: 0.18 })),
    },
    {
      name: "easy open fixture",
      expectedIds: ["EASY_OPEN", "EXPRESSIVE_OPEN"],
      notPressure: true,
      input: readInput(feature({ musicalityScore: 0.62, controlledExpressionScore: 0.54, phraseContourScore: 0.68, residualInstabilityScore: 0.22 })),
    },
    {
      name: "focused ready fixture",
      expectedIds: ["FOCUSED_READY", "ENERGIZED", "SERIOUS_TASK_MODE"],
      notPressure: true,
      input: readInput(
        feature({ inputRms: 0.065, meanRms: 0.06, peakAmplitude: 0.45, musicalityScore: 0.58, controlledExpressionScore: 0.82 }),
        scores({ activationScore: 0.9, stabilityScore: 0.25, continuityScore: 0.45, controlScore: 0.9 }),
      ),
    },
    {
      name: "expressive open fixture",
      expectedIds: ["EXPRESSIVE_OPEN", "ENERGIZED", "EXCITED_ALIVE"],
      notPressure: true,
      input: readInput(feature({ musicalityScore: 0.86, controlledExpressionScore: 0.84, residualInstabilityScore: 0.2 })),
    },
    {
      name: "tired functional fixture",
      expectedIds: ["TIRED_FUNCTIONAL", "CALM_LOW_FUEL"],
      notPressure: true,
      input: readInput(
        feature({
          inputRms: 0.014,
          meanRms: 0.012,
          peakAmplitude: 0.12,
          activeFrameRatio: 0.5,
          pitchCoverage: 0.62,
          quietFrameRatio: 0.34,
          spectralCentroid: 520,
          spectralRolloff: 760,
          musicalityScore: 0.28,
          controlledExpressionScore: 0.55,
          residualInstabilityScore: 0.32,
          phraseContinuityCoverage: 0.72,
        }),
        scores({ activationScore: -0.7, stabilityScore: 0.45, continuityScore: 0.35, controlScore: 0.7 }),
      ),
    },
    {
      name: "pressured functional fixture",
      expectedFamily: "pressure",
      input: readInput(
        chargedFeature({
          controlledExpressionScore: 0.22,
          amplitudeStability: 0.12,
          shimmerProxy: 0.12,
          residualAmplitudeInstability: 0.72,
          residualInstabilityScore: 0.74,
          residualPitchInstability: 0.76,
          phraseContinuityCoverage: 0.25,
          voicingContinuityCoverage: 0.5,
          pitchStableSegmentCoverage: 0.26,
          longestStableSegment: 2.2,
          smoothnessScore: 0.24,
          breakCount: 4,
          pauseCount: 4,
        }),
        scores({ activationScore: 1, stabilityScore: -1, continuityScore: -0.6, controlScore: -0.5 }),
      ),
    },
    {
      name: "mixed clean fixture",
      expectedIds: ["MIXED_SIGNAL", "CLEAR_SIGNAL_NO_STRONG_STATE", "CALIBRATION_READ", "EASY_OPEN"],
      notId: "PRESSURED_FUNCTIONAL",
      input: {
        ...readInput(chargedFeature({ residualInstabilityScore: 0.42, residualPitchInstability: 0.36, phraseContinuityCoverage: 0.68, breakCount: 0, pauseCount: 0 })),
        baseline: null,
        baselineProgress: 3,
        validBaselineCount: 3,
      },
    },
    {
      name: "needs another hum fixture",
      expectedIds: ["NEEDS_ANOTHER_HUM"],
      input: readInput(feature({ duration: 2, pitchCoverage: 0.2, silenceRatio: 0.65, clarityScore: 0.2 }), scores(), 1),
    },
  ];

  const report = fixtures.map((fixture) => {
    const read = buildMomentRead(fixture.input);
    const debug = read.debugEvidence;
    const line = [
      fixture.name,
      `expected ${fixture.expectedIds?.join("/") ?? fixture.expectedFamily}`,
      `actual ${read.readId}`,
      `family ${read.family}`,
      `confidence ${read.confidencePercentage}`,
      `evidence ${debug?.evidenceFamilies.join(",") ?? "n/a"}`,
    ].join(" | ");

    if (fixture.expectedIds) assert.ok(fixture.expectedIds.includes(read.readId), line);
    if (fixture.expectedFamily) assert.equal(read.family, fixture.expectedFamily, line);
    if (fixture.notPressure) assert.notEqual(read.family, "pressure", line);
    if (fixture.notId) assert.notEqual(read.readId, fixture.notId, line);
    return line;
  });

  assert.equal(report.length, fixtures.length);
});

function readOutput(read: ReturnType<typeof buildMomentRead>) {
  return [
    read.stateLabel,
    read.mainSentence,
    read.explanation,
    read.interpretation,
    read.todayVsUsualBody,
    read.whatThisMayFeelLike,
    read.tryToday,
    read.baselineNoteBody,
    read.footerNote,
    ...read.whyClues,
  ].join(" ");
}

function readInput(features: AudioFeatures, dimensionScores: DimensionScores = scores(), validBaselineCount = 18) {
  return {
    features,
    baseline: baseline(validBaselineCount),
    baselineProgress: validBaselineCount,
    validBaselineCount,
    quality: "clean" as const,
    captureQuality: "good" as const,
    dimensionScores,
    debug: true,
  };
}

function chargedFeature(overrides: Partial<AudioFeatures> = {}) {
  return feature({
    pitchRange: 11,
    pitchVariance: 1500,
    jitter: 0.05,
    residualInstabilityScore: 0.66,
    residualPitchInstability: 0.7,
    residualAmplitudeInstability: 0.5,
    phraseContinuityCoverage: 0.36,
    voicingContinuityCoverage: 0.58,
    pitchStableSegmentCoverage: 0.38,
    breakCount: 2,
    pauseCount: 2,
    avgPauseLength: 0.42,
    microBreakRatio: 0.07,
    activeFrameRatio: 0.78,
    pitchCoverage: 0.78,
    musicalityScore: 0.3,
    controlledExpressionScore: 0.5,
    ...overrides,
  });
}

function lowMoodFeature(overrides: Partial<AudioFeatures> = {}) {
  return feature({
    inputRms: 0.008,
    meanRms: 0.006,
    rmsEnergy: 0.00025,
    activeFrameRatio: 0.5,
    quietFrameRatio: 0.38,
    spectralCentroid: 430,
    spectralRolloff: 650,
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
  });
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

function baseline(count = 18): BaselineStats {
  const base = feature();

  return {
    count,
    version: 2,
    validBaselineCount: count,
    sourceSessionIds: [],
    mean: base,
    stdDev: {},
    median: {},
    mad: {},
    iqr: {},
  };
}

function feature(overrides: Partial<AudioFeatures> = {}): AudioFeatures {
  return {
    duration: 10,
    rmsEnergy: 0.002,
    silenceRatio: 0.05,
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
